import { MicroServiceABC } from "@qillie/wheel-micro-service";
import ScraperControlService from "../utils/ScraperControlService";
import { JobMatchingConstants } from "../utils/constants/AppConstants";
import { ScraperFactory } from "../utils/ScraperFactory";

/**
 * 메인 서비스 노출 클래스
 * @domain main_service_communicate
 */
export default class MainServiceCommunicateService extends MicroServiceABC {
  private readonly scraperControlService: ScraperControlService;
  private readonly factory: ScraperFactory;
  private isInitialized: boolean = false;

  constructor() {
    super([]);
    // 싱글톤 패턴 활용하여 인스턴스 재사용
    this.factory = ScraperFactory.getInstance();
    this.scraperControlService = new ScraperControlService([]);
  }

  /**
   * 초기화 메서드 - 첫 요청에서만 실행하여 중복 초기화 방지
   */
  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized) return;

    await this.factory.initializeServices();
    this.isInitialized = true;
  }

  /**
   * 테스트 API
   * @httpMethod get
   * @path /test
   */
  public async test({ }: {}): Promise<any> {
    await this.ensureInitialized();
    return await this.scraperControlService.openSaramin();
  }

  /**
   * 스크래핑 스케줄링 시작 API
   * @httpMethod get
   * @path /run
   */
  public async run({ }: {}): Promise<any> {
    await this.ensureInitialized();
    return await this.scraperControlService.scheduleWeekdayScraping();
  }

  /**
   * 자동 채용공고 매칭 실행 API
   * @httpMethod get
   * @path /run-auto-job-matching
   */
  public async runAutoJobMatching({ }: {}): Promise<any> {
    await this.ensureInitialized();
    return await this.scraperControlService.runAutoJobMatching();
  }

  /**
   * 추천 채용공고 조회 API
   * @httpMethod get
   * @path /recommended-jobs
   * @objectParams {number} limit - 반환할 추천 채용공고 수 (기본값: 50000)
   */
  public async getRecommendedJobs({
    limit = JobMatchingConstants.DEFAULT_MATCH_LIMIT
  }: {
    limit?: number;
  }): Promise<any> {
    await this.ensureInitialized();
    return await this.factory.getRecommendedJobs(limit);
  }

  /**
   * 전체 채용공고 조회 API
   * @httpMethod get
   * @path /all-jobs
   * @objectParams {number} limit - 반환할 채용공고 수 (기본값: 50000)
   * @objectParams {number} page - 페이지 번호 (기본값: 1)
   */
  public async getAllJobs({
    limit = JobMatchingConstants.DEFAULT_MATCH_LIMIT,
    page = 1
  }: {
    limit?: number;
    page?: number;
  }): Promise<any> {
    await this.ensureInitialized();
    return await this.factory.getAllJobs(limit, page);
  }

  /**
   * 사람인 자동 지원 API
   * @httpMethod get
   * @path /apply-saramin-jobs
   */
  public async applySaraminJobs({ }: {}): Promise<any> {
    await this.ensureInitialized();
    return await this.scraperControlService.applySaraminJobs();
  }

  /**
   * 사용자 이력서/프롬프트 조회 API
   * @httpMethod get
   * @path /user-resume-prompt
   * @objectParams {string} userId - 사용자 ID
   */
  public async getUserResumePrompt({ userId }: { userId: string }): Promise<any> {
    if (!userId) return { error: 'userId required' };
    const { UserResumePromptService } = await import('../user/UserResumePromptService');
    return await UserResumePromptService.getResumePrompt(userId);
  }

  /**
   * 사용자 이력서/프롬프트 저장 API
   * @httpMethod post
   * @path /user-resume-prompt
   * @objectParams {string} userId - 사용자 ID
   * @objectParams {string} resume - 이력서
   * @objectParams {string} prompt - 프롬프트
   */
  public async setUserResumePrompt({ userId, resume, prompt }: { userId: string, resume: string, prompt: string }): Promise<any> {
    if (!userId) return { error: 'userId required' };
    const { UserResumePromptService } = await import('../user/UserResumePromptService');
    await UserResumePromptService.upsertResumePrompt(userId, resume, prompt);
    return { success: true };
  }
}
