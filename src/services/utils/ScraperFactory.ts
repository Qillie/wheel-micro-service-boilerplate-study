import path from 'path';
import dotenv from 'dotenv';
import { LoggerService } from './logging/LoggerService';
import { ImageProcessor } from './image/ImageProcessor';
import { OcrService } from './ocr/OcrService';
import { BrowserService } from './browser/BrowserService';
import { JobRepository } from './db/JobRepository';
import { SaraminScraper } from './scraper/SaraminScraper';
import { ConfigService } from './config/ConfigService';
import JobMatchingService from './ai/JobMatchingService';

// 환경 변수 로드
dotenv.config();

/**
 * 스크래퍼 서비스 팩토리
 * 필요한 모든 서비스를 생성하고 의존성 주입을 관리합니다.
 */
export class ScraperFactory {
  private static instance: ScraperFactory;
  private readonly tempDir: string;

  // 서비스 인스턴스 - readonly로 불변성 보장
  private readonly logger: LoggerService;
  private readonly imageProcessor: ImageProcessor;
  private readonly ocrService: OcrService;
  private readonly browserService: BrowserService;
  private readonly jobRepository: JobRepository;
  private readonly saraminScraper: SaraminScraper;
  private readonly configService: ConfigService;
  private matchingService: JobMatchingService | null = null;

  // 초기화 상태 추적
  private isInitializing: boolean = false;
  private initializePromise: Promise<void> | null = null;

  private constructor() {
    // 임시 디렉토리 경로 설정
    this.tempDir = path.join(process.cwd(), 'temp');

    // 로깅 서비스 초기화
    this.logger = new LoggerService(true);

    // 각 서비스 초기화 - 생성자에서는 동기 초기화만 수행
    this.imageProcessor = new ImageProcessor(this.tempDir, this.logger);
    this.ocrService = new OcrService(process.env.MISTRAL_API_KEY, this.logger, this.imageProcessor);
    this.browserService = new BrowserService(this.logger);
    this.jobRepository = new JobRepository(this.logger);
    this.configService = new ConfigService();

    // 스크래퍼 초기화
    this.saraminScraper = new SaraminScraper(
      this.logger,
      this.browserService,
      this.jobRepository,
      this.ocrService,
      this.imageProcessor
    );
  }

  /**
   * 싱글톤 인스턴스 획득
   */
  public static getInstance(): ScraperFactory {
    if (!ScraperFactory.instance) {
      ScraperFactory.instance = new ScraperFactory();
    }
    return ScraperFactory.instance;
  }

  /**
   * 모든 서비스 초기화 - 동시 호출 방지 최적화
   */
  public async initializeServices(): Promise<void> {
    // 이미 초기화 중이면 진행 중인 프로미스 반환
    if (this.isInitializing && this.initializePromise) {
      return this.initializePromise;
    }

    // 초기화 중으로 상태 변경
    this.isInitializing = true;

    // 초기화 프로미스 생성 및 저장
    this.initializePromise = (async () => {
      try {
        // 매칭 서비스가 이미 초기화되었으면 건너뜀
        if (!this.matchingService) {
          await this.initializeMatchingService();
        }
      } catch (error) {
        this.logger.log(`서비스 초기화 중 오류 발생: ${error}`, 'error');
      } finally {
        // 초기화 완료 상태로 변경
        this.isInitializing = false;
      }
    })();

    return this.initializePromise;
  }

  /**
   * 매칭 서비스 초기화 - 최적화됨
   */
  public async initializeMatchingService(): Promise<void> {
    try {
      // 이미 초기화되었으면 건너뜀 (중복 작업 방지)
      if (this.matchingService) {
        return;
      }

      // 매칭 서비스 초기화
      this.matchingService = new JobMatchingService();
      this.logger.log('채용공고 매칭 서비스 초기화 완료', 'success');
    } catch (error) {
      this.logger.log(`채용공고 매칭 서비스 초기화 실패: ${error}`, 'error');
      this.matchingService = null;
    }
  }

  /**
   * 로깅 상세 모드 설정
   */
  public setVerboseLogging(verbose: boolean): void {
    this.logger.setVerbose(verbose);
  }

  /**
   * 채용공고 매칭 실행 - 성능 개선
   */
  public async matchJobs(limit: number, matchLimit: number): Promise<any> {
    // 매칭 서비스가 없으면 초기화 시도
    if (!this.matchingService) {
      await this.initializeMatchingService();

      // 초기화 후에도 없으면 오류 반환
      if (!this.matchingService) {
        return {
          success: false,
          message: '매칭 서비스가 초기화되지 않았습니다.'
        };
      }
    }

    // 매개변수 직접 전달로 성능 향상
    return await this.matchingService.matchJobs({ limit, matchLimit });
  }

  /**
   * 추천 채용공고 조회 - 최적화
   */
  public async getRecommendedJobs(limit: number): Promise<any> {
    // 바로 JobRepository 사용 (항상 초기화되어 있음)
    const matchResult = await this.jobRepository.getRecommendedJobs(limit);
    return {
      success: true,
      recommendedJobs: matchResult
    };
  }

  /**
   * 전체 채용공고 조회
   * @param limit 반환할 채용공고 수
   * @param page 페이지 번호
   * @returns 전체 채용공고 데이터
   */
  public getAllJobs(limit: number, page: number): Promise<any> {
    try {
      // JobRepository에서 전체 채용공고 조회
      return Promise.resolve().then(async () => {
        this.logger.log(`전체 채용공고 조회 요청 (페이지: ${page}, 항목 수: ${limit})`, 'info');

        const jobs = await this.jobRepository.getAllJobs(limit, page);
        const result = {
          success: true,
          jobs: jobs,
          page: page,
          limit: limit,
          total: jobs.length
        };

        this.logger.log(`전체 채용공고 ${jobs.length}개 조회 결과 반환 완료`, 'success');
        return result;
      });
    } catch (error) {
      this.logger.log(`전체 채용공고 조회 중 오류 발생: ${error}`, 'error');
      return Promise.resolve({
        success: false,
        message: '전체 채용공고 조회 중 오류가 발생했습니다.',
        error: String(error)
      });
    }
  }

  // 각 서비스 획득 메서드 - 읽기 전용으로 변경하여 불변성 보장
  public getLogger(): LoggerService {
    return this.logger;
  }

  public getImageProcessor(): ImageProcessor {
    return this.imageProcessor;
  }

  public getOcrService(): OcrService {
    return this.ocrService;
  }

  public getBrowserService(): BrowserService {
    return this.browserService;
  }

  public getJobRepository(): JobRepository {
    return this.jobRepository;
  }

  public getSaraminScraper(): SaraminScraper {
    return this.saraminScraper;
  }

  public getConfigService(): ConfigService {
    return this.configService;
  }

  public getMatchingService(): JobMatchingService | null {
    return this.matchingService;
  }
}
