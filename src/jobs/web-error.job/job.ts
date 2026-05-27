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

// 웹 서비스 에러 탐지
export async function serverErrorJob() {

}
