import { sleep } from "@qillie/wheel-micro-service";
import puppeteer, { Browser, Page, EvaluateFunc } from "puppeteer";
import { LoggerService } from "../logging/LoggerService";

/**
 * 브라우저 관리 서비스
 */
export class BrowserService {
  private browser: Browser | null = null;
  private readonly logger: LoggerService;

  constructor(logger: LoggerService) {
    this.logger = logger;
  }

  /**
   * 브라우저 초기화
   */
  public async initializeBrowser(headless: boolean = false): Promise<Browser> {
    if (this.browser) {
      return this.browser;
    }

    this.browser = await puppeteer.launch({
      headless,
      defaultViewport: null,
      args: [
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
        "--allow-running-insecure-content",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage"
      ],
    });

    this.logger.log("브라우저 초기화 완료", "success");
    return this.browser;
  }

  /**
   * 브라우저 종료
   */
  public async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.logger.log("브라우저 종료", "info");
    }
  }

  /**
   * 새 페이지 생성
   */
  public async createPage(): Promise<Page> {
    if (!this.browser) {
      throw new Error("브라우저가 초기화되지 않았습니다");
    }

    const page = await this.browser.newPage();
    page.setDefaultTimeout(60000); // 60초 타임아웃
    return page;
  }

  /**
   * 재시도 로직을 포함한 페이지 로드
   */
  public async loadPageWithRetry(
    page: Page, 
    url: string, 
    options: {
      retries?: number;
      waitForSelector?: string;
      waitTime?: number;
    } = {}
  ): Promise<boolean> {
    const {
      retries = 3,
      waitForSelector,
      waitTime = 1000
    } = options;

    let success = false;
    let attempt = 0;

    while (!success && attempt < retries) {
      try {
        await page.goto(url, { 
          waitUntil: "domcontentloaded", 
          timeout: 60000 
        });
        
        if (waitForSelector) {
          await page.waitForSelector(waitForSelector, { timeout: 30000 })
            .catch(err => {
              this.logger.log(`선택자(${waitForSelector}) 대기 중 오류: ${err}`, 'warning');
            });
        }
        
        if (waitTime) {
          await sleep(waitTime);
        }
        
        success = true;
      } catch (error) {
        attempt++;
        this.logger.log(
          `페이지 로드 실패 (${attempt}/${retries}): ${url} - ${error}`, 
          'warning'
        );
        
        if (attempt >= retries) {
          this.logger.log(`최대 재시도 횟수 초과`, 'error');
          return false;
        }
        
        await sleep(3000); // 재시도 전 3초 대기
      }
    }
    
    return success;
  }

  /**
   * 페이지에서 텍스트 내용 추출
   */
  public async extractTextContent(page: Page, selector: string): Promise<string> {
    try {
      return await page.evaluate((sel) => {
        const element = document.querySelector(sel);
        return element ? element.textContent?.trim() || "" : "";
      }, selector);
    } catch (error) {
      this.logger.log(`텍스트 추출 실패 (${selector}): ${error}`, 'error');
      return "";
    }
  }

  /**
   * 페이지에서 평가 함수 실행
   */
  public async evaluate<T = any>(page: Page, fn: string | EvaluateFunc<any>, ...args: any[]): Promise<T | null> {
    try {
      return await page.evaluate(fn as any, ...args) as T;
    } catch (error) {
      this.logger.log(`페이지 평가 실패: ${error}`, 'error');
      return null;
    }
  }
}