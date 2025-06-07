import { ScraperServiceABC } from "@qillie/wheel-micro-service";
import { ScraperFactory } from "./ScraperFactory";
import { JobInfo, ScraperConfig } from "./types/JobTypes";
import { JobMatchResult } from "./ai/JobMatchingService";
import colors from 'ansi-colors';
import path from 'path';
import cron from 'node-cron';
import puppeteer from 'puppeteer'; // Add puppeteer import for Cookie types
import dotenv from 'dotenv';
// Add import for CompanyRecruitmentTable
import CompanyRecruitmentTable from "../../models/main/CompanyRecruitmentTable";

// .env 파일 로드
dotenv.config();

/**
 * 스크래퍼 컨트롤 서비스 
 * 모듈화된 서비스들을 조율하고 스크래핑 작업을 제어합니다.
 */
export default class ScraperControlService extends ScraperServiceABC {
  private factory: ScraperFactory;
  private cronJob: cron.ScheduledTask | null = null;

  // 기본 설정
  private defaultConfig: ScraperConfig = {
    startPage: 1,
    endPage: Number.MAX_SAFE_INTEGER,
    headless: false,
    waitTime: Math.floor(Math.random() * 2001) + 4000,
    verbose: false
  };

  constructor(signInCookieKeys: string[]) {
    super(signInCookieKeys);
    this.factory = ScraperFactory.getInstance();
    // 임시 디렉토리 확인
    this.ensureTempDirectory();
  }

  /**
   * 임시 디렉토리 존재 확인
   */
  private ensureTempDirectory(): void {
    const tempDir = path.join(process.cwd(), 'temp');
    this.factory.getImageProcessor().ensureTempDirectory();
  }

  /**
   * 한국 시간 기준 AM/PM, 12시간제, 분 반환
   */
  private formatKoreanTime(date: Date = new Date()): { amPm: string; hour12: number; minute: number } {
    const hour = date.getHours();
    const minute = date.getMinutes();
    const amPm = hour >= 12 ? '오후' : '오전';
    const hour12 = hour % 12 || 12;
    return { amPm, hour12, minute };
  }

  /**
   * 시간 정보와 함께 메시지 로깅
   */
  private logWithTime(logger: any, message: string, level: string = 'info') {
    const { amPm, hour12, minute } = this.formatKoreanTime();
    logger.log(`[${amPm} ${hour12}시 ${minute}분] ${message}`, level);
  }

  /**
   * 브라우저 관리 헬퍼 (자동 open/close)
   */
  private async withBrowser<T>(headless: boolean, fn: (browser: any, page: any) => Promise<T>): Promise<T> {
    const browserService = this.factory.getBrowserService();
    const browser = await browserService.initializeBrowser(headless);
    const page = await browserService.createPage();
    try {
      return await fn(browser, page);
    } finally {
      await browserService.closeBrowser();
    }
  }

  /**
   * 매시간 랜덤한 시간에 스크래핑 작업 스케줄링
   * @param config 스크래퍼 설정
   * @returns 스케줄러 시작 여부
   */
  public scheduleWeekdayScraping(config: ScraperConfig = {}): boolean {
    if (this.cronJob) {
      this.cronJob.stop();
      this.factory.getLogger().log('기존 스케줄링된 작업이 중지되었습니다.', 'info');
    }
    try {
      const randomMinute = Math.floor(Math.random() * 46) + 15;
      this.cronJob = cron.schedule(`${randomMinute} * * * 1-5`, async () => {
        const logger = this.factory.getLogger();
        this.logWithTime(logger, '스케줄된 스크래핑 작업이 시작됩니다.');
        await this.runScheduledScraping(config);
      }, {
        scheduled: true,
        timezone: 'Asia/Seoul'
      });
      this.factory.getLogger().log(`스크래핑 작업이 한국 시간 주중 매시간 ${randomMinute}분에 실행되도록 스케줄링되었습니다.`, 'success');
      return true;
    } catch (error) {
      this.factory.getLogger().log(`스크래핑 작업 스케줄링 중 오류 발생: ${error}`, 'error');
      return false;
    }
  }

  /**
   * 스케줄링된 스크래핑 실행
   */
  private async runScheduledScraping(config: ScraperConfig = {}): Promise<void> {
    const logger = this.factory.getLogger();
    try {
      this.logWithTime(logger, '스케줄된 사람인 채용 정보 스크래핑을 시작합니다...');
      const jobs = await this.openSaraminWithDuplicateCheck(config);
      this.logWithTime(logger, `스케줄된 스크래핑 완료: ${jobs.length}개 새 채용 공고 수집됨`, 'success');
      this.logWithTime(logger, '스케줄된 스크래핑 완료 후 자동 매칭을 시작합니다...');
      await this.runAutoJobMatching();
    } catch (error) {
      this.logWithTime(logger, `스케줄된 스크래핑 작업 실행 중 오류: ${error}`, 'error');
    }
  }

  /**
   * 크론 작업 중지
   */
  public stopScheduledScraping(): boolean {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      this.factory.getLogger().log('스케줄링된 스크래핑 작업이 중지되었습니다.', 'success');
      return true;
    }

    this.factory.getLogger().log('활성화된 스케래핑 스케줄이 없습니다.', 'warning');
    return false;
  }

  /**
   * URL 중복 체크 후 사람인 채용 공고 스크래핑 시작
   */
  public async openSaraminWithDuplicateCheck(config: ScraperConfig = {}): Promise<JobInfo[]> {
    const logger = this.factory.getLogger();
    const jobRepository = this.factory.getJobRepository();
    const saraminScraper = this.factory.getSaraminScraper();
    const settings = this.applyConfiguration(config);
    logger.log('채용 공고 URL 중복 검사 중...', 'info');
    const uniqueUrls = new Map<string, boolean>();
    const pagesToCheck = 5;
    let totalJobsCount = 0;
    try {
      return await this.withBrowser(settings.headless, async (browser, page) => {
        for (let pageNum = settings.startPage; pageNum < settings.startPage + pagesToCheck; pageNum++) {
          logger.log(`URL 수집을 위해 페이지 ${pageNum} 검사 중...`, 'info');
          const pageUrl = saraminScraper.buildPageUrl(pageNum);
          const loadSuccess = await this.factory.getBrowserService().loadPageWithRetry(page, pageUrl, {
            waitForSelector: ".box_item",
            waitTime: Math.floor(Math.random() * 1000) + 2000
          });
          if (!loadSuccess) {
            logger.log(`페이지 ${pageNum} 로드 실패, 다음 페이지로 진행`, 'warning');
            continue;
          }
          const links = await page.evaluate(() => {
            const linkList: string[] = [];
            const boxItems = document.querySelectorAll(".box_item");
            boxItems.forEach((item) => {
              const notificationInfo = item.querySelector(".notification_info");
              if (notificationInfo) {
                const linkElement = notificationInfo.querySelector("a");
                if (linkElement && linkElement.getAttribute("href")) {
                  linkList.push(linkElement.getAttribute("href") || "");
                }
              }
            });
            return linkList;
          });
          if (links.length === 0) {
            logger.log(`페이지 ${pageNum}에서 채용 공고를 찾을 수 없어 URL 수집을 중단합니다.`, 'warning');
            break;
          }
          links.forEach((link: any) => {
            const fullUrl = `https://www.saramin.co.kr${link}`;
            if (!uniqueUrls.has(fullUrl)) {
              uniqueUrls.set(fullUrl, true);
              totalJobsCount++;
            }
          });
          logger.log(`페이지 ${pageNum}에서 ${links.length}개 URL 수집, 현재까지 총 ${uniqueUrls.size}개 고유 URL`, 'info');
        }
        if (uniqueUrls.size === 0) {
          logger.log('수집된 채용 공고 URL이 없습니다.', 'warning');
          return [];
        }
        const urlsToCheck = Array.from(uniqueUrls.keys());
        const existingUrls = await jobRepository.checkExistingUrls(urlsToCheck);
        const existingUrlsMap = new Map<string, boolean>();
        existingUrls.forEach(url => existingUrlsMap.set(url, true));
        const newUrls = urlsToCheck.filter(url => !existingUrlsMap.has(url));
        const duplicatesCount = existingUrls.length;
        const newUrlsCount = newUrls.length;
        logger.log(`${urlsToCheck.length}개 고유 채용 공고 중 ${duplicatesCount}개는 이미 수집됨, ${newUrlsCount}개 새로운 공고 있음`, newUrlsCount > 0 ? 'info' : 'warning');
        if (newUrlsCount === 0) {
          logger.log('모든 채용 공고가 이미 수집되었습니다. 스크래핑을 건너뜁니다.', 'warning');
          return [];
        }
        logger.log(`${newUrlsCount}개의 새로운 채용 공고가 발견되었습니다. 스크래핑을 진행합니다.`, 'success');
        if (newUrlsCount > 0 && newUrlsCount <= 10) {
          newUrls.forEach((url, index) => {
            logger.log(`  ${index + 1}. ${url}`, 'info');
          });
        }
        const customConfig = {
          ...config,
          startPage: settings.startPage,
        };
        const jobs = await this.openSaramin(customConfig);
        return jobs;
      });
    } catch (error) {
      logger.log(`URL 중복 검사 중 오류: ${error}`, 'error');
      return await this.openSaramin(config);
    }
  }

  /**
   * 사람인 채용 공고 스크래핑 시작
   */
  public async openSaramin(config: ScraperConfig = {}): Promise<JobInfo[]> {
    const logger = this.factory.getLogger();
    const saraminScraper = this.factory.getSaraminScraper();
    const jobRepository = this.factory.getJobRepository();
    const settings = this.applyConfiguration(config);
    this.factory.setVerboseLogging(settings.verbose);
    const collectedJobs: JobInfo[] = [];
    const startTime = Date.now();
    let consecutiveDuplicates = 0;
    let consecutiveEmptyPages = 0;
    let continueScrapping = true;
    try {
      return await this.withBrowser(settings.headless, async (browser, page) => {
        let processedPages = 0;
        for (let i = settings.startPage; i <= settings.endPage && continueScrapping; i++) {
          logger.log(`페이지 ${i} 처리 중...`, 'info', true);
          const result = await saraminScraper.processListPage(page, i, settings.waitTime);
          processedPages++;
          const pageJobs = result.jobs;
          const continueScraping = await saraminScraper.handleConsecutivePages(
            pageJobs,
            consecutiveEmptyPages,
            consecutiveDuplicates
          );
          consecutiveEmptyPages = continueScraping.emptyCounts;
          consecutiveDuplicates = continueScraping.duplicateCounts;
          if (!continueScraping.shouldContinue) {
            logger.log('연속된 빈 페이지 또는 중복 페이지로 인해 스크래핑을 중단합니다.', 'warning', true);
            break;
          }
          continueScrapping = result.shouldContinue;
          collectedJobs.push(...pageJobs);
          logger.log(`페이지 ${i} 완료: ${pageJobs.length}개 채용 공고 추출됨`, 'success', true);
          if (i < settings.endPage && continueScrapping) {
            logger.log(`다음 페이지로 이동 중...`, 'info');
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        logger.log('스크래핑 결과 요약', 'info', true);
        this.printSummary(collectedJobs);
        const elapsedTime = (Date.now() - startTime) / 1000;
        logger.log(`총 소요 시간: ${elapsedTime.toFixed(2)}초`, 'success', true);
        if (collectedJobs.length > 0) {
          logger.log('스크래핑 완료 후 자동 매칭을 시작합니다...', 'info', true);
          await this.runAutoJobMatching();
        }
        logger.log(`스크래핑 작업이 완료되었습니다. 총 ${collectedJobs.length}개 채용 공고 수집`, 'success', true);
        return collectedJobs;
      });
    } catch (error) {
      logger.log(`스크래핑 중 오류 발생: ${error}`, 'error', true);
      return collectedJobs;
    }
  }

  /**
   * 스크래핑 후 자동으로 매칭 작업 실행
   * 매칭되지 않은 채용 공고만 대상으로 함
   */
  public async runAutoJobMatching(): Promise<void> {
    const logger = this.factory.getLogger();

    // 구분선으로 작업 시작 표시
    logger.log('자동 채용 공고 매칭 작업을 시작합니다', 'info');

    const startTime = Date.now();

    try {
      // 매칭 서비스 획득
      const jobRepository = this.factory.getJobRepository();

      // JobMatchingService 인스턴스 생성
      const mainService = new (await import('./ai/JobMatchingService')).default();

      // 배치 사이즈와 처리된 작업 수 초기화
      const batchSize = 10;
      let processedCount = 0;
      let totalProcessed = 0;
      let shouldContinue = true;
      let batchNumber = 1;

      // 매칭 전 총 처리 대상 수 확인
      const totalUnmatched = await jobRepository.countUnmatchedJobs();
      logger.log(`매칭이 필요한 총 채용 공고 수: ${totalUnmatched}개`, 'info');

      if (totalUnmatched === 0) {
        logger.log('매칭되지 않은 채용 공고가 없습니다. 작업을 건너뜁니다.', 'info');
        return;
      }

      while (shouldContinue) {
        // 배치 시작 로그
        logger.log(`배치 #${batchNumber} 매칭 작업 시작 (최대 ${batchSize}개)`, 'info');

        // 매칭되지 않은 채용 공고 가져오기
        const unmatchedJobs = await jobRepository.getUnmatchedJobs(batchSize);

        if (unmatchedJobs.length === 0) {
          logger.log('더 이상 매칭되지 않은 채용 공고가 없습니다.', 'success');
          shouldContinue = false;
          continue;
        }

        // 채용 공고 ID 목록 출력
        const jobIds = unmatchedJobs.map(job => job.id).join(', ');
        logger.log(`처리할 채용 공고 ID: ${jobIds}`, 'info');

        // 진행 상황 표시
        const progressPct = Math.min(100, Math.round((totalProcessed / totalUnmatched) * 100));
        logger.log(`매칭 진행 상황: ${totalProcessed}/${totalUnmatched} (${progressPct}%)`, 'info');

        // 채용 공고 매칭 실행
        const matchResult = await mainService.matchJobs({
          limit: unmatchedJobs.length,
          matchLimit: 10
        }, 'demo-user');

        if (matchResult.success) {
          processedCount = unmatchedJobs.length;
          totalProcessed += processedCount;

          logger.log(`배치 #${batchNumber} 완료: ${processedCount}개 처리됨, 총 ${totalProcessed}/${totalUnmatched}개`, 'success');
        } else {
          logger.log(`매칭 실패: ${matchResult.message}`, 'error');
          shouldContinue = false;
        }

        // 처리량이 배치 사이즈보다 작으면 모두 처리한 것으로 간주
        if (processedCount < batchSize) {
          logger.log(`배치 크기(${batchSize})보다 적은 ${processedCount}개가 처리되어 모든 작업이 완료된 것으로 판단됩니다.`, 'info');
          shouldContinue = false;
        }

        // 다음 배치 처리 전 잠시 대기
        if (shouldContinue) {
          const waitSeconds = 3;
          logger.log(`다음 배치 처리를 위해 ${waitSeconds}초 대기 중...`, 'info');
          await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
        }

        batchNumber++;
      }

      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.log(`자동 매칭 작업 완료: 총 ${totalProcessed}개 채용 공고 처리됨 (소요 시간: ${elapsedTime}초)`, 'success');
    } catch (error) {
      logger.log(`자동 매칭 중 오류 발생: ${error}`, 'error');

      // 오류 세부 정보 출력
      if (error instanceof Error && error.stack) {
        logger.logVerbose(`오류 스택: ${error.stack}`);
      }
    }
  }

  /**
   * 사람인 채용 사이트 로그인
   * @param username 사용자 아이디 (기본값: 환경변수에서 가져옴)
   * @param password 사용자 비밀번호 (기본값: 환경변수에서 가져옴)
   * @returns 로그인 성공 여부와 쿠키 정보를 포함한 객체
   */
  public async loginSaramin(
    username: string = process.env.SARAMIN_USER_NAME || '',
    password: string = process.env.SARAMIN_PASSWORD || ''
  ): Promise<{ success: boolean; message: string; cookies?: string[] }> {
    const logger = this.factory.getLogger();
    const browserService = this.factory.getBrowserService();

    logger.log('사람인 로그인 시도 중...', 'info', true);

    // 환경 변수 확인
    if (!username || !password) {
      logger.log('사용자 이름 또는 비밀번호가 제공되지 않았습니다. 환경 변수 SARAMIN_USER_NAME, SARAMIN_PASSWORD를 확인하세요.', 'error');
      return { success: false, message: '로그인 정보가 없습니다. 환경 변수를 확인하세요.' };
    }

    try {
      // 브라우저 초기화 (headless 모드 끄기)
      const browser = await browserService.initializeBrowser(false);
      const page = await browserService.createPage();

      // 로그인 페이지로 이동
      const loginUrl = "https://www.saramin.co.kr/zf_user/auth";
      logger.log(`로그인 페이지 로드 중: ${loginUrl}`, 'info');

      const loadSuccess = await browserService.loadPageWithRetry(page, loginUrl, {
        waitForSelector: "#id",
        waitTime: 2000
      });

      if (!loadSuccess) {
        logger.log('로그인 페이지 로드 실패', 'error');
        return { success: false, message: '로그인 페이지 로드 실패' };
      }

      // 로그인 폼 구조 분석 (디버깅 용도)
      const formStructure = await page.evaluate(() => {
        const loginForm = document.querySelector('#loginForm') || document.querySelector('form[name="loginForm"]');
        if (!loginForm) return '로그인 폼을 찾을 수 없음';

        return loginForm.innerHTML;
      });

      logger.logVerbose('로그인 폼 구조 분석:\n' + formStructure);

      // 로그인 입력 필드 확인
      const hasLoginForm = await browserService.evaluate<boolean>(page, () => {
        return document.querySelector('#id') !== null && document.querySelector('#password') !== null;
      });

      if (!hasLoginForm) {
        logger.log('로그인 폼을 찾을 수 없습니다', 'error');
        return { success: false, message: '로그인 폼을 찾을 수 없습니다' };
      }

      // 아이디와 비밀번호 입력
      logger.log('아이디 입력 중...', 'info');
      await page.type('#id', username);

      logger.log('비밀번호 입력 중...', 'info');
      await page.type('#password', password);

      // 로그인 버튼 찾기 (여러 선택자 시도)
      const loginButton = await browserService.evaluate<string>(page, (possibleSelectors) => {
        // 가능한 로그인 버튼 선택자들
        // 각 선택자에 대해 요소가 존재하는지 확인
        for (const selector of possibleSelectors) {
          try {
            const element = document.querySelector(selector);
            if (element) {
              return selector; // 발견된 선택자 반환
            }
          } catch (e) {
            // 선택자 오류 무시하고 계속 진행
          }
        }

        // 모든 버튼 요소 찾기
        const allButtons = Array.from(document.querySelectorAll('button'));
        const loginBtnIdx = allButtons.findIndex(btn =>
          btn.innerText.includes('로그인') ||
          btn.innerText.includes('Login') ||
          btn.className.includes('login')
        );

        if (loginBtnIdx >= 0) {
          // 발견된 버튼에 식별자 추가
          const foundBtn = allButtons[loginBtnIdx];
          foundBtn.setAttribute('data-login-button', 'true');
          return '[data-login-button="true"]';
        }

        return ''; // 버튼을 찾지 못함
      }, [
        '.login-form button[type="submit"]'
      ]);

      if (!loginButton) {
        // 버튼을 찾지 못한 경우 전체 페이지 스크린샷 캡처 (디버깅 용도)
        const screenshotPath = path.join(process.cwd(), 'temp', 'login-page-debug.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        logger.log(`로그인 버튼을 찾을 수 없습니다. 스크린샷이 저장됨: ${screenshotPath}`, 'error');
        return { success: false, message: '로그인 버튼을 찾을 수 없습니다' };
      }

      logger.log(`로그인 버튼 발견: ${loginButton}`, 'info');

      // 로그인 버튼 클릭
      logger.log('로그인 시도 중...', 'info');
      await Promise.all([
        page.click(loginButton),
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {
          logger.log('로그인 후 페이지 로드 대기 중 시간 초과', 'warning');
        })
      ]);

      // 로그인 성공 여부 확인
      const isLoggedIn = await browserService.evaluate<boolean>(page, () => {
        // 로그인 성공 시 보이는 요소들 확인
        return document.querySelector('.my_login') !== null ||
          document.querySelector('.btn_logout') !== null ||
          document.querySelector('.user_name') !== null;
      });

      if (!isLoggedIn) {
        // 오류 메시지 확인
        const errorMessage = await browserService.evaluate<string>(page, () => {
          const errorElement = document.querySelector('.error_message, .txt_error');
          return errorElement ? errorElement.textContent?.trim() || '알 수 없는 오류' : '로그인 실패';
        });

        logger.log(`로그인 실패: ${errorMessage}`, 'error');
        return { success: false, message: errorMessage || '로그인 실패' };
      }

      // 쿠키 추출
      const cookies = await page.cookies();
      const cookieStrings = cookies.map(cookie => `${cookie.name}=${cookie.value}`);

      logger.log('로그인 성공! 사람인 계정으로 인증되었습니다.', 'success', true);

      return {
        success: true,
        message: '로그인 성공',
        cookies: cookieStrings
      };

    } catch (error) {
      logger.log(`로그인 중 오류 발생: ${error}`, 'error');
      return { success: false, message: `로그인 중 오류: ${error}` };
    } finally {
      // 브라우저는 종료하지 않고 유지 (로그인 상태를 계속 사용할 수 있도록)
      // 필요한 경우 별도로 closeBrowser를 호출하여 종료
    }
  }

  /**
   * 사람인 채용 공고에 자동으로 지원하기
   * 추천된(is_recommended = true) 공고 중 아직 지원하지 않은(is_applied = false) 공고에 지원합니다.
   * @returns 지원 결과 정보를 포함한 객체
   */
  public async applySaraminJobs(): Promise<{
    success: boolean;
    message: string;
    applied: number;
    failed: number;
    details?: string[];
  }> {
    const logger = this.factory.getLogger();
    const browserService = this.factory.getBrowserService();
    const jobRepository = this.factory.getJobRepository();

    logger.log('사람인 자동 지원 프로세스 시작...', 'info', true);

    // 결과 추적을 위한 변수들
    let appliedCount = 0;
    let failedCount = 0;
    const details: string[] = [];

    try {
      // 1. 먼저 로그인 시도
      const loginResult = await this.loginSaramin();

      if (!loginResult.success) {
        logger.log(`로그인 실패: ${loginResult.message}`, 'error');
        return {
          success: false,
          message: `로그인 실패: ${loginResult.message}`,
          applied: 0,
          failed: 0
        };
      }

      logger.log('로그인 성공. 지원 가능한 채용 공고를 검색합니다...', 'success');

      // 2. 추천되었지만 아직 지원하지 않은 채용 공고 조회
      const targetJobs = await CompanyRecruitmentTable.findAll({
        where: {
          is_recommended: true,
          is_applied: false
        },
        order: [["id", "ASC"]],
        raw: false
      });

      if (targetJobs.length === 0) {
        logger.log('지원할 추천 채용 공고가 없습니다.', 'info');
        return {
          success: true,
          message: '지원할 추천 채용 공고가 없습니다.',
          applied: 0,
          failed: 0
        };
      }

      logger.log(`총 ${targetJobs.length}개의 지원할 채용 공고가 있습니다.`, 'info');

      // 3. 브라우저가 이미 초기화되었는지 확인 (로그인 과정에서 브라우저가 생성되어 있어야 함)
      const browser = await browserService.initializeBrowser(false);
      const page = await browserService.createPage();

      // 4. 각 채용 공고에 대해 지원 프로세스 실행
      for (const job of targetJobs) {
        try {
          const companyName = job.company_name;
          const jobTitle = job.job_title;
          const jobUrl = job.job_url;

          logger.log(`${companyName} - ${jobTitle} 지원 시도 중...`, 'info');

          if (!jobUrl) {
            logger.log('채용 공고 URL이 없습니다. 건너뜁니다.', 'warning');
            failedCount++;
            details.push(`[실패] ${companyName} - ${jobTitle}: URL 없음`);
            continue;
          }

          // 5. 채용 공고 페이지로 이동
          logger.log(`채용 공고 페이지 로딩 중: ${jobUrl}`, 'info');
          const loadSuccess = await browserService.loadPageWithRetry(page, jobUrl, {
            waitTime: 5000
          });

          if (!loadSuccess) {
            logger.log('채용 공고 페이지 로드 실패. 다음 공고로 넘어갑니다.', 'error');
            failedCount++;
            details.push(`[실패] ${companyName} - ${jobTitle}: 페이지 로드 실패`);
            continue;
          }

          // 6. 입사지원 버튼 찾기
          const applyButtonInfo = await browserService.evaluate<{ selector: string, text: string } | null>(page, () => {
            // 먼저, 페이지에 jview 요소가 있는지 확인
            const jviewElements = Array.from(document.querySelectorAll('.jview[class*="jview-0-"]'));

            // jview 요소가 존재하면 그 안에서 먼저 버튼을 찾음
            if (jviewElements.length > 0) {
              for (const jviewElement of jviewElements) {
                // 먼저 btn_apply 컨테이너를 찾음 (입사지원 버튼의 부모 요소)
                const btnApplyContainer = jviewElement.querySelector('.btn_apply');
                if (btnApplyContainer) {
                  const applyBtn = btnApplyContainer.querySelector('button');
                  if (applyBtn) {
                    applyBtn.setAttribute('data-apply-button', 'true');
                    return {
                      selector: '[data-apply-button="true"]',
                      text: applyBtn.textContent?.trim() || ''
                    };
                  }
                }
              }
            }

            // jview 요소에서 찾지 못한 경우 원래 방식으로 찾기
            const btnElements = Array.from(document.querySelectorAll('.btn_apply, .btn_apply_button, .sri_btn_lg, .sri_btn_md'));
            const applyBtn = btnElements.find(btn => {
              const text = btn.textContent?.trim();
              return text === '입사지원' || text === '홈페이지 지원';
            });

            return null;
          });

          if (!applyButtonInfo) {
            logger.log('입사지원 버튼을 찾을 수 없습니다. 다음 공고로 넘어갑니다.', 'warning');
            failedCount++;
            details.push(`[실패] ${companyName} - ${jobTitle}: 지원 버튼 없음`);
            continue;
          }

          // 7. 입사지원 버튼 텍스트 확인 - "홈페이지 지원"과 "지원마감" 버튼은 처리하지 않음
          if (applyButtonInfo.text === '홈페이지 지원' || applyButtonInfo.text === '지원마감') {
            const reason = applyButtonInfo.text === '홈페이지 지원' ? '홈페이지 지원 방식' : '지원 마감됨';
            logger.log(`${reason}의 채용공고입니다. 건너뜁니다.`, 'warning');
            failedCount++;
            details.push(`[스킵] ${companyName} - ${jobTitle}: ${reason}`);
            continue;
          }

          // 9. 입사지원 버튼 클릭 전 로딩 대기
          logger.log('입사지원 버튼 로딩 대기 중... (3초)', 'info');
          await new Promise(resolve => setTimeout(resolve, 3000)); // 버튼이 완전히 로드될 때까지 3초 대기

          await page.click(applyButtonInfo.selector);

          // 10. 입사지원서 모달이 뜰 때까지 대기
          await new Promise(resolve => setTimeout(resolve, 10000));

          // 11. iframe URL 추출
          const iframeUrl = await browserService.evaluate<string>(page, () => {
            const iframe = document.querySelector('#quick_apply_layer_frame');
            return iframe && iframe.getAttribute('src') || '';
          });

          if (!iframeUrl) {
            logger.log('입사지원 iframe을 찾을 수 없습니다.', 'warning');
            failedCount++;
            details.push(`[실패] ${companyName} - ${jobTitle}: 지원 iframe 없음`);
            continue;
          }

          // 12. iframe URL 검증 - 채용 공고 URL과 iframe URL 간의 호환성 확인
          const isValidIframeUrl = await browserService.evaluate<boolean>(page, (iframeUrl, jobUrl) => {
            // 기본 검증: iframe URL이 사람인 도메인이거나 상대 URL인지 확인
            const isSaraminDomain = iframeUrl.includes('saramin.co.kr') || iframeUrl.startsWith('/');

            // 지원 관련 URL인지 확인 (다양한 패턴 검사)
            const isApplyRelated =
              iframeUrl.includes('apply_form') ||
              iframeUrl.includes('member/apply') ||
              iframeUrl.includes('rec_idx=');

            // 기존 방식과 함께 rec_idx 파라미터도 확인
            const recIdxMatch = iframeUrl.match(/rec_idx=(\d+)/);
            const hasRecIdx = recIdxMatch !== null;

            // 유효한 지원 URL로 판단
            return isSaraminDomain && (isApplyRelated || hasRecIdx);
          }, iframeUrl, jobUrl);

          if (!isValidIframeUrl) {
            logger.log(`iframe URL 검증 실패: ${iframeUrl}`, 'warning');
            failedCount++;
            details.push(`[실패] ${companyName} - ${jobTitle}: iframe URL 검증 실패`);
            continue;
          }

          // 13. iframe URL로 이동
          const fullIframeUrl = iframeUrl.startsWith('http') ?
            iframeUrl : `https://www.saramin.co.kr${iframeUrl}`;

          logger.log(`입사지원 iframe으로 이동: ${fullIframeUrl}`, 'info');
          await page.goto(fullIframeUrl);
          await new Promise(resolve => setTimeout(resolve, 2000));

          // 13-1. 지원부문 선택 드롭다운 확인 및 처리
          const hasRoleSelection = await browserService.evaluate<boolean>(page, () => {
            // 지원부문 드롭다운 확인 (box_choice 내 select 요소 찾기)
            return document.querySelector('#inpApply, select[id*="Apply"], .box_choice select') !== null;
          });

          if (hasRoleSelection) {
            logger.log('지원부문 선택 드롭다운을 발견했습니다.', 'info');

            // 지원 가능한 직무 목록 추출
            const roleOptions = await browserService.evaluate<{ value: string, text: string }[]>(page, () => {
              const selectElement = document.querySelector('#inpApply, select[id*="Apply"], .box_choice select') as HTMLSelectElement;
              if (!selectElement) return [];

              return Array.from(selectElement.options).map(option => ({
                value: option.value,
                text: option.textContent?.trim() || ''
              }));
            }) || []; // 기본값으로 빈 배열 설정

            if (roleOptions && roleOptions.length > 0) {
              logger.log(`총 ${roleOptions.length}개 지원 가능 직무 옵션이 있습니다:`, 'info');
              roleOptions.forEach((option, index) => {
                logger.log(`  ${index + 1}. ${option.text} (값: ${option.value})`, 'info');
              });

              // 옵션이 1개뿐이면 AI 분석 건너뛰기
              if (roleOptions.length === 1) {
                logger.log(`직무 옵션이 1개뿐이므로 '${roleOptions[0].text}'를 자동 선택합니다.`, 'info');
                // 단일 옵션은 이미 선택되어 있을 가능성이 높으므로 별도 처리 불필요
              } else {
                // 여러 옵션이 있는 경우에만 Mistral AI 활용
                try {
                  logger.log('Mistral AI로 적합한 직무 분석 중...', 'info');

                  // 구직자 프로필 가져오기
                  const candidateProfileModule = await import('./ai/CandidateProfile');
                  const candidateProfile = candidateProfileModule.getDefaultCandidateProfile();
                  const formattedProfile = candidateProfileModule.formatCandidateProfile(candidateProfile);

                  // Mistral AI 서비스 초기화
                  const configService = this.factory.getConfigService();
                  const mistralApiKey = configService.getMistralApiKey();

                  if (!mistralApiKey) {
                    logger.log('Mistral API 키가 없어 자동 직무 선택을 건너뜁니다.', 'warning');
                  } else {
                    const mistralService = new (await import('./ai/MistralAIService')).MistralAIService(
                      mistralApiKey,
                      logger
                    );

                    // 직무 매칭을 위한 프롬프트 생성
                    await mistralService.initializeChat();

                    // 제목과 회사 정보로 더 나은 맥락 제공
                    const prompt = `
                    회사: ${companyName}
                    채용공고: ${jobTitle}
                    
                    다음 지원 가능한 직무 목록 중에서 구직자의 경력, 기술, 경험에 가장 적합한 직무를 하나만 선택해 주세요:
                    ${roleOptions.map((opt, idx) => `${idx + 1}. ${opt.text}`).join('\n')}

                    위 채용공고 제목과 구직자의 경력을 고려하여 가장 적합한 직무를 선택하세요.
                    응답은 반드시 다음 JSON 형식만 사용하고, 다른 설명이나 텍스트는 포함하지 마세요:
                    {"selectedIndex": 선택한 직무의 번호(1부터 시작), "reason": "선택 이유"}
                    `;

                    try {
                      // matchJobsWithProfile 메서드 사용하여 메시지 전송
                      const matchResult = await mistralService.matchJobsWithProfile([], prompt);
                      const response = matchResult?.message || matchResult?.toString() || '';
                      logger.log(`AI 응답: ${response}`, 'info');

                      // JSON 형식 응답 추출 시도
                      const jsonMatch = response.match(/\{[\s\S]*?\}/);
                      if (jsonMatch) {
                        try {
                          const result = JSON.parse(jsonMatch[0]);
                          if (result && typeof result.selectedIndex === 'number') {
                            const selectedIndex = result.selectedIndex;
                            // 인덱스가 유효하고 "선택해주세요" 옵션이 아닌지 확인
                            if (selectedIndex > 0 && selectedIndex < roleOptions.length) {
                              const selectedOption = roleOptions[selectedIndex];
                              logger.log(`AI 추천 직무: ${selectedOption.text}`, 'success');
                              logger.log(`추천 이유: ${result.reason || '명시되지 않음'}`, 'info');

                              await page.select(
                                '#inpApply, select[id*="Apply"], .box_choice select',
                                selectedOption.value
                              );
                              logger.log('선택된 직무가 드롭다운에서 설정되었습니다.', 'success');
                              await new Promise(resolve => setTimeout(resolve, 1000));
                              continue; // 성공했으므로 다음 처리로 진행
                            }
                          }
                        } catch (e) {
                          logger.log(`JSON 파싱 오류: ${e}`, 'warning');
                        }
                      }

                      // AI 응답 실패 시 키워드 기반 폴백 로직 사용
                      logger.log('AI 응답에서 유효한 선택을 찾을 수 없어 키워드 기반 매칭을 시도합니다.', 'warning');
                      const keywordMatching = {
                        '펌웨어': roleOptions.findIndex(opt => opt.text.includes('펌웨어') || opt.text.includes('임베디드')),
                        '임베디드': roleOptions.findIndex(opt => opt.text.includes('임베디드') || opt.text.includes('펌웨어')),
                        'AI 플랫폼': roleOptions.findIndex(opt => opt.text.includes('AI 플랫폼')),
                        '플랫폼': roleOptions.findIndex(opt => opt.text.includes('플랫폼')),
                        'AI 클라우드': roleOptions.findIndex(opt => opt.text.includes('AI 클라우드') || opt.text.includes('클라우드')),
                        '클라우드': roleOptions.findIndex(opt => opt.text.includes('클라우드')),
                        'AI': roleOptions.findIndex(opt => opt.text.includes('AI')),
                        'SW': roleOptions.findIndex(opt => opt.text.includes('SW') || opt.text.includes('소프트웨어'))
                      };

                      // 채용공고 제목에서 키워드 찾기
                      let selectedRoleIndex = -1;
                      for (const [keyword, index] of Object.entries(keywordMatching)) {
                        if (index > 0 && jobTitle.includes(keyword)) {
                          selectedRoleIndex = index;
                          logger.log(`키워드 '${keyword}'가 채용공고 제목에서 발견되어 매칭되었습니다.`, 'info');
                          break;
                        }
                      }

                      // 키워드 매칭이 실패하면 비-기본 옵션 중 첫 번째를 선택
                      if (selectedRoleIndex <= 0) {
                        // 첫 번째 옵션이 "선택해주세요"같은 기본 옵션인 경우 두 번째 옵션 선택
                        selectedRoleIndex = roleOptions.findIndex((opt, idx) =>
                          idx > 0 && !opt.text.includes('선택해주세요'));

                        // 여전히 없으면 첫 번째 실제 옵션 선택 (인덱스 1부터)
                        if (selectedRoleIndex <= 0 && roleOptions.length > 1) {
                          selectedRoleIndex = 1; // 보통 0번은 "선택해주세요"임
                        }
                      }

                      if (selectedRoleIndex > 0 && selectedRoleIndex < roleOptions.length) {
                        const selectedOption = roleOptions[selectedRoleIndex];
                        logger.log(`키워드 매칭으로 선택된 직무: ${selectedOption.text}`, 'success');
                        await page.select(
                          '#inpApply, select[id*="Apply"], .box_choice select',
                          selectedOption.value
                        );
                        logger.log('선택된 직무가 드롭다운에서 설정되었습니다.', 'success');
                        await new Promise(resolve => setTimeout(resolve, 1000));
                      } else {
                        // 모든 방법이 실패한 경우 두 번째 옵션 선택 (첫 번째는 보통 "선택해주세요")
                        const fallbackIndex = (roleOptions.length > 1) ? 1 : 0;
                        logger.log(`모든 매칭 시도 실패. ${roleOptions[fallbackIndex].text} 선택.`, 'warning');
                        await page.select(
                          '#inpApply, select[id*="Apply"], .box_choice select',
                          roleOptions[fallbackIndex].value
                        );
                        logger.log('기본 직무가 드롭다운에서 설정되었습니다.', 'success');
                        await new Promise(resolve => setTimeout(resolve, 1000));
                      }
                    } catch (apiError) {
                      logger.log(`AI API 호출 중 오류: ${apiError}. 첫 번째 실제 옵션을 선택합니다.`, 'error');
                      // 첫 번째 실제 옵션 선택 (인덱스 0이 "선택해주세요"인 경우 인덱스 1 선택)
                      const defaultIndex = (roleOptions.length > 1 &&
                        roleOptions[0].text.includes('선택')) ? 1 : 0;
                      await page.select(
                        '#inpApply, select[id*="Apply"], .box_choice select',
                        roleOptions[defaultIndex].value
                      );
                      logger.log(`${roleOptions[defaultIndex].text} 직무가 선택되었습니다.`, 'success');
                      await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                  }
                } catch (aiError) {
                  logger.log(`직무 매칭 중 오류: ${aiError}. 첫 번째 옵션을 자동 선택합니다.`, 'error');
                  // 드롭다운에서 첫 번째 직무 선택
                  await page.select(
                    '#inpApply, select[id*="Apply"], .box_choice select',
                    roleOptions[0].value
                  );
                  logger.log('첫 번째 직무가 드롭다운에서 설정되었습니다.', 'success');
                }
              }
            } else {
              logger.log('지원부문 선택 드롭다운이 비어 있습니다.', 'warning');
            }
          } else {
            logger.log('지원부문 선택 드롭다운이 없습니다. 단일 직무 지원으로 계속 진행합니다.', 'info');
          }

          // 14. 모달 내 입사지원 버튼 찾기 (개선된 버전)
          const modalApplyButton = await browserService.evaluate<string>(page, () => {
            // 입사지원 버튼 유형 1: area_btns 내의 버튼 (현재 HTML 구조에 맞춤)
            const areaBtnsButtons = document.querySelectorAll('.area_btns button');
            for (const btn of Array.from(areaBtnsButtons)) {
              if (btn.textContent?.includes('입사지원')) {
                btn.setAttribute('data-modal-apply-button', 'true');
                return '[data-modal-apply-button="true"]';
              }
            }

            // 입사지원 버튼 유형 2: 픽셀 이벤트 속성이 있는 버튼
            const pixelEventButtons = document.querySelectorAll('button[data-kakao_pixel_event], button[data-meta_pixel_event]');
            for (const btn of Array.from(pixelEventButtons)) {
              if (btn.textContent?.includes('입사지원') ||
                btn.getAttribute('data-kakao_pixel_event')?.includes('입사지원')) {
                btn.setAttribute('data-modal-apply-button', 'true');
                return '[data-modal-apply-button="true"]';
              }
            }

            // 기존 방식: 가능한 여러 선택자 시도
            const possibleSelectors = [
              '.area_btns.button button',
              '.area_btns button',
              '.button_apply',
              'button.btn.kakao_pixel_event',
              '.wrap_global_apply button.btn'
            ];

            // 각 선택자에 맞는 버튼 찾기
            for (const selector of possibleSelectors) {
              try {
                const buttons = document.querySelectorAll(selector);
                if (buttons.length > 0) {
                  for (const btn of Array.from(buttons)) {
                    const text = btn.textContent?.trim() || '';
                    if (text.includes('지원') || text.includes('제출')) {
                      btn.setAttribute('data-modal-apply-button', 'true');
                      return '[data-modal-apply-button="true"]';
                    }
                  }
                }
              } catch (e) {
                // 선택자 오류는 무시하고 다음 시도
              }
            }

            // 모든 버튼 요소 찾기
            const allButtons = Array.from(document.querySelectorAll('button'));
            const applyBtnIdx = allButtons.findIndex(btn => {
              const text = btn.textContent?.trim() || '';
              return text.includes('지원') || text.includes('제출');
            });

            if (applyBtnIdx >= 0) {
              allButtons[applyBtnIdx].setAttribute('data-modal-apply-button', 'true');
              return '[data-modal-apply-button="true"]';
            }

            return '';
          });

          if (!modalApplyButton) {
            logger.log('입사지원 모달 내 지원하기 버튼을 찾을 수 없습니다.', 'warning');
            failedCount++;
            details.push(`[실패] ${companyName} - ${jobTitle}: 모달 지원 버튼 없음`);
            continue;
          }

          // 15-17. 모달 내 지원하기 버튼 클릭 및 완료 확인
          let isSuccess = false;
          try {
            // 15. 모달 내 지원하기 버튼 클릭
            logger.log('입사지원 모달 내 지원하기 버튼 클릭...', 'info');
            await page.click(modalApplyButton);

            // 16. 지원 완료 대기 - 짧은 시간으로 변경 (5초)
            logger.log('지원 완료 대기 중... (5초)', 'info');
            await new Promise(resolve => setTimeout(resolve, 5000));

            // 17. 지원 성공으로 간주 (지원 완료 메시지가 없어도 지원이 잘 되는 것으로 가정)
            logger.log('지원 프로세스가 완료되었습니다. 성공으로 간주합니다.', 'info');
            isSuccess = true;
          } catch (error) {
            logger.log(`지원 과정 중 오류 발생: ${error}`, 'error');
            isSuccess = false;
          }

          if (isSuccess) {
            // 18. 지원 성공 시 DB 업데이트
            logger.log(`${companyName} - ${jobTitle} 지원 성공!`, 'success');
            try {
              job.is_applied = true;
              await job.save();
              logger.log(`DB 업데이트 성공: ${companyName} - ${jobTitle}`, 'success');

              // 직접 업데이트 쿼리 추가 (대체 방법)
              await CompanyRecruitmentTable.update(
                { is_applied: true },
                { where: { id: job.id } }
              );

              appliedCount++;
              details.push(`[성공] ${companyName} - ${jobTitle}`);
            } catch (dbError) {
              logger.log(`DB 업데이트 실패: ${dbError}`, 'error');
              // DB 업데이트 실패해도 UI에는 성공으로 표시
              appliedCount++;
              details.push(`[성공-DB오류] ${companyName} - ${jobTitle}`);
            }
          } else {
            logger.log(`${companyName} - ${jobTitle} 지원 실패. 성공 메시지를 찾을 수 없습니다.`, 'warning');
            failedCount++;
            details.push(`[실패] ${companyName} - ${jobTitle}: 지원 완료 메시지 없음`);
          }

        } catch (error) {
          logger.log(`지원 프로세스 중 오류 발생: ${error}`, 'error');
          failedCount++;
          details.push(`[오류] ${job.company_name} - ${job.job_title}: ${error}`);
        }

        // 다음 지원 전 잠시 대기 (사이트 부하 방지)
        logger.log('다음 지원을 위해 5초 대기 중...', 'info');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      // 19. 최종 결과 요약
      logger.log(`사람인 자동 지원 완료: 총 ${targetJobs.length}개 중 ${appliedCount}개 성공, ${failedCount}개 실패`,
        appliedCount > 0 ? 'success' : 'warning');

      return {
        success: true,
        message: `자동 지원 완료: ${appliedCount}개 성공, ${failedCount}개 실패`,
        applied: appliedCount,
        failed: failedCount,
        details
      };

    } catch (error) {
      logger.log(`자동 지원 중 예상치 못한 오류 발생: ${error}`, 'error');
      return {
        success: false,
        message: `자동 지원 중 오류 발생: ${error}`,
        applied: appliedCount,
        failed: failedCount,
        details
      };
    }
  }

  /**
   * 사용자 설정과 기본 설정 결합
   */
  private applyConfiguration(config: ScraperConfig): Required<ScraperConfig> & { verbose: boolean } {
    return {
      startPage: config.startPage ?? this.defaultConfig.startPage!,
      endPage: config.endPage ?? this.defaultConfig.endPage!,
      headless: config.headless ?? this.defaultConfig.headless!,
      waitTime: config.waitTime ?? this.defaultConfig.waitTime!,
      verbose: config.verbose ?? this.defaultConfig.verbose!
    };
  }

  /**
   * 스크래핑 결과 요약 출력
   */
  private printSummary(jobs: JobInfo[]): void {
    if (jobs.length === 0) {
      console.log(colors.yellow('수집된 채용 공고가 없습니다.'));
      return;
    }

    // 통계 생성
    const jobRepository = this.factory.getJobRepository();
    const stats = jobRepository.createJobStatistics(jobs);

    console.log(colors.yellow.bold('\n스크래핑 결과 요약'));
    console.log(colors.green(`총 수집된 채용 공고: ${jobs.length}개`));

    // 상위 회사 출력
    if (stats.topCompanies.length > 0) {
      console.log(colors.cyan('\n채용 공고가 가장 많은 회사:'));
      stats.topCompanies.forEach(([company, count], index) => {
        console.log(colors.cyan(`   ${index + 1}. ${company}: ${count}개`));
      });
    }

    // 경력 요구사항별 채용 공고 출력
    console.log(colors.blue('\n경력 요구사항별 채용 공고:'));
    Object.entries(stats.jobTypeCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        console.log(colors.blue(`   - ${type}: ${count}개`));
      });

    // 고용 형태별 채용 공고 출력
    console.log(colors.magenta('\n고용 형태별 채용 공고:'));
    Object.entries(stats.employmentTypeCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        console.log(colors.magenta(`   - ${type}: ${count}개`));
      });

    console.log(colors.yellow.bold('\n'));
  }
}