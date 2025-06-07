/**
 * 애플리케이션 상수를 관리하는 파일
 */

/**
 * Mistral AI 관련 상수
 */
export const MistralAIConstants = {
  MODEL: {
    CHAT: 'mistral-small-latest',
    DEFAULT: 'mistral-small-latest'
  },
  ROLES: {
    USER: 'user' as const,
    ASSISTANT: 'assistant' as const,
    SYSTEM: 'system' as const
  },
  TEMPERATURE: 0.1,
  MAX_TOKENS: 4096,
  MESSAGE_PREFIXES: {
    PROFILE: '# 구직자 프로필\n\n',
    JOBS_LIST: '# 평가할 채용공고 목록\n\n',
    SEARCH_QUERY: '# 검색 쿼리\n\n'
  }
};

/**
 * 파일 경로 관련 상수
 */
export const PathConstants = {
  DATA_DIR: 'data',
  TEMP_DIR: 'temp',
  MISTRAL_PERSIST_FILE: 'mistral-persist.json',
  OPENAI_PERSIST_FILE: 'openai-persist.json'  // 추가: OpenAI 설정 저장용
};

/**
 * 로깅 관련 상수
 */
export const LoggingConstants = {
  LEVELS: {
    DEBUG: 'debug',
    INFO: 'info',
    SUCCESS: 'success',
    WARNING: 'warning',
    ERROR: 'error'
  },
  PRIORITY: {
    'debug': 0,
    'info': 1,
    'success': 2,
    'warning': 3,
    'error': 4
  },
  DEFAULT_LEVEL: 'info'
};

/**
 * 채용 매칭 관련 상수
 */
export const JobMatchingConstants = {
  // 기본 매칭 결과 개수
  DEFAULT_MATCH_LIMIT: 50000
};
