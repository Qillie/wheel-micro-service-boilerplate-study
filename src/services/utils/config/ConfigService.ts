import dotenv from 'dotenv';

// 환경 변수 로드
dotenv.config();

/**
 * 환경 변수 및 설정 중앙 관리 서비스
 */
export class ConfigService {
  /**
   * 환경 변수에서 Mistral API 키 가져오기
   */
  public getMistralApiKey(): string {
    const apiKey = process.env.MISTRAL_API_KEY;
    
    if (!apiKey) {
      console.warn('경고: Mistral API 키가 설정되지 않았습니다.');
    }
    
    return apiKey || '';
  }

  /**
   * 환경 변수에서 OpenAI 어시스턴트 ID 가져오기
   */
  public getOpenAIAssistantId(): string {
    return process.env.OPENAI_ASSISTANT_ID || '';
  }
  
  /**
   * 환경 변수에서 데이터베이스 연결 정보 가져오기
   */
  public getDbConfig(): {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  } {
    return {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      username: process.env.DB_USERNAME || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'jobs'
    };
  }
  
  /**
   * 환경 변수에서 로그 레벨 가져오기
   */
  public getLogLevel(): string {
    return process.env.LOG_LEVEL || 'info';
  }
  
  /**
   * 환경 변수를 이름으로 가져오기
   */
  public get(name: string, defaultValue: string = ''): string {
    return process.env[name] || defaultValue;
  }
}
