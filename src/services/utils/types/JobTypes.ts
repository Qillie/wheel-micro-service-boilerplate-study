/**
 * 채용 정보 인터페이스
 */
export interface JobInfo {
  companyName: string;
  jobTitle: string;
  jobLocation: string;
  jobType: string;
  jobSalary: string;
  deadline: string;
  employmentType: string;
  url?: string;
  companyType?: string;
  jobDescription?: string;
  descriptionType?: string;

  // 추가 ID 필드
  id: number;

  // 스크랩 시점
  scrapedAt?: string;

  // 매칭 결과 필드 (JobMatchResult 호환)
  score: number;
  reason?: string;
  strength?: string;
  weakness?: string;
  apply_yn?: boolean;
}

/**
 * 키워드가 추가된 채용 정보 인터페이스 (검색용)
 */
export interface KeywordJobInfo extends JobInfo {
  keyword?: string;
}

/**
 * 스크래퍼 설정 인터페이스
 */
export interface ScraperConfig {
  startPage?: number;
  endPage?: number;
  headless?: boolean;
  waitTime?: number;
  verbose?: boolean; // 상세 로깅 활성화 여부
}

/**
 * 직무 설명 추출 결과 인터페이스
 */
export interface JobDescriptionResult {
  content: string;
  type: string;
}

/**
 * 연속 페이지 처리 결과 인터페이스
 */
export interface ConsecutivePagesResult {
  emptyCounts: number;
  duplicateCounts: number;
  shouldContinue: boolean;
}

/**
 * 페이지 처리 결과 인터페이스
 */
export interface PageProcessResult {
  jobs: JobInfo[];
  shouldContinue: boolean;
}
