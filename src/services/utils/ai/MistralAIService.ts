import { Mistral } from '@mistralai/mistralai';
import path from 'path';
import { LoggerService } from '../logging/LoggerService';
import { JobInfo } from '../types/JobTypes';
import { FileHelper } from '../helpers/FileHelper';
import { PathConstants, MistralAIConstants } from '../constants/AppConstants';
import { getSystemInstructions } from './SystemInstructions';
import { sleep } from "@qillie/wheel-micro-service";

// 메시지 타입 정의
type MistralRole = 'system' | 'user' | 'assistant';

// 메시지 인터페이스 정의
interface MistralMessage {
  role: MistralRole;
  content: string;
}

// 컨텐츠 청크 인터페이스
interface ContentChunk {
  type: string;
  text: {
    value: string;
  };
}

/**
 * Mistral AI API와 상호작용하는 서비스
 */
export class MistralAIService {
  private mistralClient: Mistral | null = null;
  private readonly logger: LoggerService;
  private readonly apiKey: string;
  private readonly systemInstructions: string;
  private readonly persistFilePath: string;
  private chatHistory: MistralMessage[] = [];

  // API 요청 최적화를 위한 상수
  private static readonly MAX_RETRIES = 3;
  private static readonly INITIAL_BACKOFF_MS = 2000;
  private static readonly MAX_BACKOFF_MS = 15000;
  private static readonly BATCH_SIZE = 10; // 대용량 데이터 처리용 배치 사이즈

  constructor(apiKey: string, logger: LoggerService) {
    this.apiKey = apiKey;
    this.logger = logger;
    this.systemInstructions = getSystemInstructions();

    // 데이터 저장 파일 경로 설정
    this.persistFilePath = path.join(__dirname, '../../../data', PathConstants.MISTRAL_PERSIST_FILE);
  }

  /**
   * Mistral API 클라이언트 초기화 (지연 초기화 패턴)
   */
  private initializeClient(): boolean {
    // 이미 초기화되었으면 중복 작업 방지
    if (this.mistralClient) {
      return true;
    }

    if (!this.apiKey) {
      this.logger.log('Mistral API 키가 제공되지 않았습니다', 'warning');
      return false;
    }

    try {
      this.mistralClient = new Mistral({ apiKey: this.apiKey });
      this.logger.log('Mistral AI API 클라이언트 초기화 완료', 'success');
      return true;
    } catch (error) {
      this.logger.log(`Mistral AI API 클라이언트 초기화 실패: ${error}`, 'error');
      this.mistralClient = null;
      return false;
    }
  }

  /**
   * 채팅 기록 초기화 - 메모리 최적화
   */
  public async initializeChat(): Promise<void> {
    try {
      // 기존 배열 참조 제거로 메모리 최적화
      this.chatHistory = [];

      // 시스템 지시사항으로 채팅 기록 초기화
      this.chatHistory.push({
        role: "system",
        content: this.systemInstructions
      });

      this.logger.log('채팅 기록이 초기화되었습니다', 'success');
    } catch (error) {
      this.logger.log(`채팅 기록 초기화 실패: ${error}`, 'error');
      throw error;
    }
  }

  /**
   * 채팅 메시지 전송 - 지수 백오프 적용 및 최적화
   */
  private async sendMessage(content: string, role: MistralRole = 'user'): Promise<string> {
    // 클라이언트 초기화 확인
    if (!this.initializeClient()) {
      throw new Error('Mistral API 클라이언트가 초기화되지 않았습니다');
    }

    // 채팅 기록이 없으면 초기화
    if (this.chatHistory.length === 0) {
      await this.initializeChat();
    }

    // 메시지 추가
    this.chatHistory.push({ role, content });

    let retryCount = 0;
    let backoffTime = MistralAIService.INITIAL_BACKOFF_MS;

    // 재시도 루프
    while (retryCount <= MistralAIService.MAX_RETRIES) {
      try {
        if (retryCount > 0) {
          this.logger.log(`Mistral API 요청 재시도 중... (${retryCount}/${MistralAIService.MAX_RETRIES})`, 'warning');
        }

        // API 호출 - 복사본 사용하여 원본 데이터 보호
        const response = await this.mistralClient!.chat.complete({
          model: MistralAIConstants.MODEL.CHAT,
          messages: [...this.chatHistory], // 안전한 복사
          temperature: MistralAIConstants.TEMPERATURE,
          maxTokens: MistralAIConstants.MAX_TOKENS
        });

        // 응답 처리 및 ContentChunk[] 타입 처리
        let messageContent = response?.choices?.[0]?.message?.content || '';

        // ContentChunk[] 타입인 경우 문자열로 변환
        if (Array.isArray(messageContent) && messageContent.length > 0 &&
          typeof messageContent[0] === 'object' && 'type' in messageContent[0]) {
          messageContent = (messageContent as unknown as ContentChunk[])
            .filter(chunk => chunk.type === 'text')
            .map(chunk => chunk.text.value)
            .join('');
        }

        // 유효한 응답만 기록에 추가
        if (messageContent) {
          this.chatHistory.push({
            role: 'assistant',
            content: messageContent as string
          });
        }

        return messageContent as string;
      } catch (error: any) {
        // 속도 제한 오류나 일시적 서버 오류는 재시도
        if (this.isRetryableError(error) && retryCount < MistralAIService.MAX_RETRIES) {
          this.logger.log(`API 오류 발생, ${backoffTime / 1000}초 후 재시도...`, 'warning');
          await sleep(backoffTime);

          // 지수 백오프 적용 (최대값 제한)
          backoffTime = Math.min(backoffTime * 2, MistralAIService.MAX_BACKOFF_MS);
          retryCount++;
        } else {
          this.logger.log('Mistral AI 요청 중 오류: ' + error, 'error');
          throw error;
        }
      }
    }

    throw new Error('최대 재시도 횟수 초과');
  }

  /**
   * 재시도 가능한 오류인지 확인
   */
  private isRetryableError(error: any): boolean {
    // 속도 제한 오류 (429)
    const isRateLimit = error.statusCode === 429 ||
      (error.message && error.message.includes("rate limit"));

    // 서버 오류 (5xx)
    const isServerError = (error.statusCode >= 500 && error.statusCode < 600) ||
      (error.message && error.message.match(/5\d\d/));

    return isRateLimit || isServerError;
  }

  /**
   * 배치 처리 공통 헬퍼
   */
  private async processBatchOperation<T>(
    batches: JobInfo[][],
    context: string, // candidateProfile or query
    makePrompts: (context: string, batch: JobInfo[]) => Promise<string[]>,
    parseResult: (response: string) => T,
    logPrefix: string
  ): Promise<T[]> {
    this.logger.log(`${logPrefix}: 대용량 데이터(${batches.flat().length}개)를 ${batches.length}개 배치로 처리합니다`, 'info');
    const results: T[] = [];
    for (let i = 0; i < batches.length; i++) {
      try {
        this.logger.log(`${logPrefix} 배치 ${i + 1}/${batches.length} 처리 중...`, 'info');
        await this.initializeChat();
        const prompts = await makePrompts(context, batches[i]);
        for (const prompt of prompts) {
          const response = await this.sendMessage(prompt);
          const parsed = parseResult(response);
          if (Array.isArray(parsed)) results.push(...parsed);
          else results.push(parsed);
        }
        if (i < batches.length - 1) await sleep(2000);
      } catch (error) {
        this.logger.log(`${logPrefix} 배치 ${i + 1} 처리 중 오류: ${error}`, 'error');
      }
    }
    this.logger.log(`${logPrefix}: ${batches.length}개 배치 처리 완료, 총 ${results.length}개 결과 반환`, 'success');
    return results;
  }

  /**
   * 구직자 프로필 및 채용공고 정보로 매칭 수행 - 최적화
   */
  public async matchJobsWithProfile(
    jobs: JobInfo[],
    candidateProfile: string
  ): Promise<any> {
    const batches: JobInfo[][] = [];
    for (let i = 0; i < jobs.length; i += MistralAIService.BATCH_SIZE) {
      batches.push(jobs.slice(i, i + MistralAIService.BATCH_SIZE));
    }
    return this.processBatchOperation(
      batches,
      candidateProfile,
      async (profile, batch) => [
        `${MistralAIConstants.MESSAGE_PREFIXES.PROFILE}${profile}`,
        `${MistralAIConstants.MESSAGE_PREFIXES.JOBS_LIST}${JSON.stringify(batch.map(job => ({
          id: job.id,
          companyName: job.companyName,
          jobTitle: job.jobTitle,
          jobType: job.jobType,
          jobLocation: job.jobLocation,
          jobDescription: this.truncateText(job.jobDescription, 500)
        })))}`
      ],
      this.extractJsonFromResponse.bind(this),
      '매칭'
    );
  }

  /**
   * 검색 쿼리로 채용공고 검색 - 최적화됨
   */
  public async searchJobsWithQuery(
    query: string,
    jobs: JobInfo[]
  ): Promise<any> {
    const batches: JobInfo[][] = [];
    for (let i = 0; i < jobs.length; i += MistralAIService.BATCH_SIZE) {
      batches.push(jobs.slice(i, i + MistralAIService.BATCH_SIZE));
    }
    return this.processBatchOperation(
      batches,
      query,
      async (q, batch) => [
        `${MistralAIConstants.MESSAGE_PREFIXES.SEARCH_QUERY}${q}`,
        `${MistralAIConstants.MESSAGE_PREFIXES.JOBS_LIST}${JSON.stringify(batch.map(job => ({
          id: job.id,
          companyName: job.companyName,
          jobTitle: job.jobTitle,
          jobType: job.jobType,
          jobLocation: job.jobLocation,
          description: this.truncateText(job.jobDescription, 300)
        })))}`
      ],
      this.extractJsonFromResponse.bind(this),
      '검색'
    );
  }

  /**
   * 텍스트 길이 제한 (토큰 및 메모리 사용 최적화)
   */
  private truncateText(text: string | undefined, maxLength: number): string {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }

  /**
   * 응답에서 JSON 추출 - 정규식 및 파싱 최적화
   */
  private extractJsonFromResponse(text: string): any {
    if (!text) return text;

    // 최적화된 정규식으로 JSON 배열 찾기
    const jsonRegex = /(\[[\s\S]*?\])/g; // 비탐욕적 매칭으로 최적화
    const matches = text.match(jsonRegex);

    if (matches && matches.length > 0) {
      // 발견된 모든 JSON 형식 문자열 시도
      for (const match of matches) {
        try {
          return JSON.parse(match);
        } catch {
          // 유효하지 않은 JSON은 건너뛰고 다음 시도
          continue;
        }
      }
    }

    // JSON 배열을 찾지 못한 경우 객체 형식도 시도
    const objectRegex = /(\{[\s\S]*?\})/g;
    const objectMatches = text.match(objectRegex);

    if (objectMatches && objectMatches.length > 0) {
      for (const match of objectMatches) {
        try {
          return JSON.parse(match);
        } catch {
          continue;
        }
      }
    }

    // 모든 파싱 시도 실패 시 원본 텍스트 반환
    return text;
  }
}
