import { config } from '../../config.ts';
import { elasticClient } from '../../utils/elastic.client.ts';
import { buildEsqlQueryRequest } from '../../utils/elastic-query.client.ts';
import { logger as defaultLogger } from '../../utils/logger.ts';

// 도메인 단위 웹 서비스 에러 탐지 결과
type WebErrorDomainFinding = {
    domain: string; // 집계 대상 도메인
    totalRequests: number; // 해당 도메인 전체 요청 수
    errorCount: number; // 해당 도메인 4xx 에러 요청 수
    errorRatePercent: number; // 전체 요청 대비 4xx 에러 비율 (소수점 2자리)
};

// webErrorJob 함수 최종 반환 타입
type WebErrorJobResult = {
    detected: boolean; // 탐지 조건 충족한 도메인이 하나라도 있으면 true
    errorRateThresholdPercent: number; // 탐지에 사용된 4xx 비율 임계값 (%)
    windowMinutes: number; // 탐지에 사용된 시간 윈도우 (분)
    domainFindings: WebErrorDomainFinding[]; // 도메인별 집계 결과 전체 목록
};

// ES|QL 응답의 columns 배열 원소 타입
type EsqlColumn = {
    name: string;
};

// Elasticsearch ES|QL 응답 타입
type EsqlResponse = {
    columns?: EsqlColumn[]; // 필드 메타데이터 배열 (이름, 타입)
    values?: unknown[][]; // 실제 로그 데이터 2차원 배열
    body?: EsqlResponse; // 일부 클라이언트 버전에서 응답이 중첩되어 오는 경우
};

// ES 쿼리 실행 함수 타입
type QueryExecutor = (query: string) => Promise<EsqlResponse>;

// 경고 로그 출력을 위한 logger 추상 타입
type WebErrorLogger = {
    warn(details: unknown): void;
};

// webErrorJob 함수에 주입 가능한 옵션 타입
type WebErrorJobOptions = {
    executeQuery?: QueryExecutor; // ES 쿼리 실행 함수 (기본값: 실제 elasticClient 사용)
    errorRateThresholdPercent?: number;// 탐지로 판정하기 위한 4xx 비율 임계값 (기본값: config.detection.webErrorRatePercent)
    windowMinutes?: number; // 분석 대상 시간 범위 (기본값: config.detection.windowMinutes)
    excludedDomains?: string[]; // 탐지에서 제외할 도메인 목록 (기본값: config.detection.excludedDomains)
    logger?: WebErrorLogger; // 경고 로그 출력 logger (기본값: defaultLogger)
};

// 파싱된 로그 한 행의 타입
type WebErrorLogRow = {
    domain: string; // 요청이 들어온 도메인
    status: string; // HTTP 상태 코드
};

// 웹 서비스 에러 탐지용 ES|QL 쿼리 빌더 함수
export function buildWebErrorEsqlQuery(minutes: number = config.detection.windowMinutes): string {
    return [
        `FROM ${config.elasticsearch.indexPattern}`,
        `| WHERE @timestamp > NOW() - ${minutes}m`,
        '| KEEP @timestamp, domain, protocol_status',
        '| SORT @timestamp DESC'
    ].join(' ');
}

// 실제 elasticClient를 사용하는 기본 QueryExecutor
function createDefaultQueryExecutor(): QueryExecutor {
    return async (query: string): Promise<EsqlResponse> => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (elasticClient.transport as any).request(buildEsqlQueryRequest(query));
    };
}

// ES|QL 응답을 columns/values 보장된 형태로 정규화
function normalizeEsqlResponse(
    response: EsqlResponse
): Required<Pick<EsqlResponse, 'columns' | 'values'>> {
    const normalized = response.body ?? response;

    return {
        columns: normalized.columns ?? [],
        values: normalized.values ?? []
    };
}

// HTTP 상태코드 문자열이 4xx인지 판별
function is4xx(status: string): boolean {
    return status.startsWith('4');
}

// ES|QL 응답을 WebErrorLogRow 배열로 파싱
function parseWebErrorLogRows(response: EsqlResponse): WebErrorLogRow[] {
    const { columns, values } = normalizeEsqlResponse(response);
    const domainIndex = columns.findIndex((col) => col.name === 'domain');
    const statusIndex = columns.findIndex((col) => col.name === 'protocol_status');

    // 필요한 컬럼이 없으면 파싱 불가 -> 빈 배열 반환
    if (domainIndex === -1 || statusIndex === -1) {
        return [];
    }

    return values
        .map((row) => ({
            domain: String(row[domainIndex]),
            status: String(row[statusIndex])
        }))
        // domain이 빈 문자열이거나 status가 없는 행은 집계에서 제외
        .filter(({ domain, status }) => domain.length > 0 && status.length > 0);
}

// 에러 비율 계산 (소수점 2자리까지 반올림)
function roundRatePercent(errorCount: number, totalRequests: number): number {
    if (totalRequests === 0) {
        return 0;
    }

    return Math.round((errorCount / totalRequests) * 10000) / 100;
}

// 로그 행 배열을 도메인 별로 집계하여 WebErrorDomainFinding 배열로 변환
function buildDomainFindings(
    rows: WebErrorLogRow[],
    excludedDomains: string[]
): WebErrorDomainFinding[] {
    // Set으로 변환해 O(1) 조회
    const excludedSet = new Set(excludedDomains);
    const domainStats = new Map<
        string,
        Omit<WebErrorDomainFinding, 'domain' | 'errorRatePercent'>
    >();

    // 각 행을 순회하면서 Map에 totalRequests/errorCount 누적
    for (const row of rows) {
        // 예외 도메인이면 집계 스킵
        if (excludedSet.has(row.domain)) {
            continue;
        }

        // 해당 도메인의 누적 통계가 없으면 초기값으로 생성
        const stats = domainStats.get(row.domain) ?? {
            totalRequests: 0,
            errorCount: 0
        };

        // 4xx 여부와 무관하게 모든 요청을 totalRequests에 누적
        stats.totalRequests += 1;

        // 4xx인 경우에만 errorCount 누적 (5xx, 2xx 등은 미포함)
        if (is4xx(row.status)) {
            stats.errorCount += 1;
        }

        domainStats.set(row.domain, stats);
    }

    return [...domainStats.entries()]
        // Map을 배열로 변환하고 errorRatePercent 계산
        .map(([domain, stats]) => ({
            domain,
            totalRequests: stats.totalRequests,
            errorCount: stats.errorCount,
            errorRatePercent: roundRatePercent(stats.errorCount, stats.totalRequests)
        }))
        // errorRatePercent 내림차순 -> errorCount 내림차순으로 정렬
        .sort(
            (left, right) =>
                right.errorRatePercent - left.errorRatePercent ||
                right.errorCount - left.errorCount
        );
}

// 웹 서비스 에러 탐지 Job
export async function webErrorJob({
    executeQuery = createDefaultQueryExecutor(),
    errorRateThresholdPercent = config.detection.webErrorRatePercent,
    windowMinutes = config.detection.windowMinutes,
    excludedDomains = config.detection.excludedDomains,
    logger = defaultLogger
}: WebErrorJobOptions = {}): Promise<WebErrorJobResult> {
    const response = await executeQuery(buildWebErrorEsqlQuery(windowMinutes));

    // 도메인별 집계
    const domainFindings = buildDomainFindings(
        parseWebErrorLogRows(response),
        excludedDomains
    );

    // 집계된 도메인 중 하나라도 4xx 비율이 임계값 이상이면 detected = true
    const detected = domainFindings.some(
        (finding) => finding.errorRatePercent >= errorRateThresholdPercent
    );

    // 경고 로그 출력
    if (detected) {
        logger.warn({
            event: 'web_error_detected',
            errorRateThresholdPercent,
            windowMinutes,
            domainFindings: domainFindings.filter(
                (f) => f.errorRatePercent >= errorRateThresholdPercent
            )
        });
    }

    // 결과 반환(domainFindings는 탐지 여부와 무관하게 전체 반환)
    return {
        detected,
        errorRateThresholdPercent,
        windowMinutes,
        domainFindings
    };
}
