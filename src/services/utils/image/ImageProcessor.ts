import fs from 'fs';
import path from 'path';
import axios from 'axios';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { LoggerService } from '../logging/LoggerService';

/**
 * 이미지 처리 서비스
 */
export class ImageProcessor {
  private readonly tempDir: string;
  private logger: LoggerService;

  constructor(tempDir: string, logger: LoggerService) {
    this.tempDir = tempDir;
    this.logger = logger;
    this.ensureTempDirectory();
  }

  /**
   * 임시 디렉토리 존재 확인
   */
  public ensureTempDirectory(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * 필요시 이미지 크기 조정 및 데이터 URL로 변환
   */
  public async resizeImageIfNeeded(imageUrl: string): Promise<string> {
    const maxWidth = 10000;
    const maxHeight = 10000;

    // data:image URL인 경우 그대로 반환
    if (imageUrl.startsWith('data:image')) {
      return imageUrl;
    }

    try {
      // URL 인코딩 처리
      const encodedUrl = this.sanitizeAndEncodeUrl(imageUrl);

      // 이미지 데이터 가져오기
      const imageBuffer = await this.fetchImageData(encodedUrl);

      // 이미지 데이터 검증
      if (!imageBuffer || imageBuffer.length === 0) {
        this.logger.log(`유효하지 않은 이미지 데이터: ${imageUrl}`, 'debug');
        return '';
      }

      // 이미지 크기 조정
      return await this.processAndResizeImage(imageBuffer, maxWidth, maxHeight);
    } catch (error: any) {
      return this.handleImageProcessingError(error, imageUrl);
    }
  }

  /**
   * 이미지 데이터 가져오기
   */
  private async fetchImageData(url: string): Promise<Buffer | null> {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 15000,
        maxRedirects: 10,
        httpsAgent: new (require('https').Agent)({
          rejectUnauthorized: false
        }),
        validateStatus: status => status >= 200 && status < 400 // 3xx도 허용
      });
      // Content-Type 체크
      if (!response.headers['content-type']?.startsWith('image/')) {
        this.logger.log(`Content-Type이 image가 아님: ${url}`, 'debug');
        return null;
      }
      // 실제 이미지인지 sharp로 검사
      try {
        await sharp(response.data).metadata();
        return Buffer.from(response.data, 'binary');
      } catch {
        this.logger.log(`sharp로 이미지 판별 실패: ${url}`, 'debug');
        return null;
      }
    } catch (error) {
      this.logger.log(`이미지 다운로드 실패: ${error}`, 'warning');
      return null;
    }
  }

  /**
   * 이미지 처리 및 크기 조정
   */
  private async processAndResizeImage(
    imageBuffer: Buffer,
    maxWidth: number,
    maxHeight: number
  ): Promise<string> {
    try {
      const image = await sharp(imageBuffer);
      const metadata = await image.metadata();

      if (!metadata.width || !metadata.height) {
        this.logger.log(`이미지 메타데이터를 읽을 수 없음`, 'warning');
        return this.convertToDataUrl(imageBuffer);
      }

      // 크기 제한 확인
      if (metadata.width > maxWidth || metadata.height > maxHeight) {
        const resizedImageBuffer = await image.resize(maxWidth, maxHeight, {
          fit: sharp.fit.inside,
          withoutEnlargement: true
        }).toBuffer();

        return this.convertToDataUrl(resizedImageBuffer);
      }

      return this.convertToDataUrl(imageBuffer);
    } catch (error) {
      this.logger.log(`이미지 리사이징 실패: ${error}`, 'error');
      return this.convertToDataUrl(imageBuffer); // 원본 이미지 사용
    }
  }

  /**
   * 이미지 처리 오류 핸들링
   */
  private async handleImageProcessingError(error: any, imageUrl: string): Promise<string> {
    // 네트워크 관련 오류
    if (error.code === 'ENOTFOUND') {
      this.logger.log(`이미지 도메인을 찾을 수 없음: ${imageUrl}`, 'warning');
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
      this.logger.log(`이미지 로딩 타임아웃: ${imageUrl}`, 'warning');
    } else if (error.code === 'ERR_UNESCAPED_CHARACTERS') {
      this.logger.log(`URL 인코딩 오류: ${imageUrl}`, 'warning');
      try {
        const manuallyEncodedUrl = encodeURI(imageUrl);
        return await this.resizeImageWithFallback(manuallyEncodedUrl);
      } catch (fallbackError) {
        this.logger.log(`수동 인코딩 후에도 실패: ${fallbackError}`, 'error');
      }
    } else if (error.response?.status === 404) {
      this.logger.log(`이미지를 찾을 수 없음(404): ${imageUrl}`, 'warning');
    } else if (error.message && error.message.includes('certificate')) {
      this.logger.log(`인증서 오류, 보안 우회 시도: ${imageUrl}`, 'warning');
      return this.processImageWithSecurityBypass(imageUrl);
    } else {
      this.logger.log(`이미지 처리 오류: ${error.message || error}`, 'error');
    }

    // 최종 대안 시도
    return this.tryFallbackImageProcessing(imageUrl);
  }

  /**
   * URL 정리 및 인코딩
   */
  public sanitizeAndEncodeUrl(url: string): string {
    try {
      const parsedUrl = new URL(url);

      // 경로 부분만 인코딩
      const encodedPathname = parsedUrl.pathname
        .split('/')
        .map(segment => encodeURIComponent(decodeURIComponent(segment)))
        .join('/');

      parsedUrl.pathname = encodedPathname;

      return parsedUrl.toString();
    } catch (e) {
      // URL 파싱 실패시 기본 encodeURI 사용
      return encodeURI(url);
    }
  }

  /**
   * 이미지 버퍼를 data URL로 변환
   */
  public convertToDataUrl(buffer: Buffer): string {
    const base64Image = buffer.toString('base64');
    return `data:image/png;base64,${base64Image}`;
  }

  /**
   * 인증서 오류 우회 이미지 처리
   */
  private async processImageWithSecurityBypass(imageUrl: string): Promise<string> {
    try {
      return await this.fetchImageWithInsecureRequest(imageUrl);
    } catch (certError) {
      this.logger.log(`보안 우회 실패: ${certError}`, 'error');
      return imageUrl; // 실패 시 원본 반환
    }
  }

  /**
   * 인증서 검증 무시 이미지 요청
   */
  private async fetchImageWithInsecureRequest(url: string): Promise<string> {
    const https = require('https');
    const response = await axios.get(this.sanitizeAndEncodeUrl(url), {
      responseType: 'arraybuffer',
      timeout: 10000,
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });

    return this.convertToDataUrl(Buffer.from(response.data, 'binary'));
  }

  /**
   * 대체 이미지 처리 방법
   */
  private async resizeImageWithFallback(url: string): Promise<string> {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 10000,
        maxRedirects: 5,
        httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
      });

      const imageBuffer = Buffer.from(response.data, 'binary');
      return this.convertToDataUrl(imageBuffer);
    } catch (error) {
      this.logger.log(`대체 이미지 처리 실패: ${error}`, 'error');
      return url;
    }
  }

  /**
   * 최종 대안 이미지 처리
   */
  private async tryFallbackImageProcessing(imageUrl: string): Promise<string> {
    try {
      return await this.convertUrlToDataUrlWithFetch(imageUrl);
    } catch (error) {
      this.logger.log(`최종 이미지 변환 실패, 원본 사용: ${error}`, 'warning');
      return imageUrl; // 최종적으로 실패하면 원본 URL 반환
    }
  }

  /**
   * URL을 Data URL로 변환
   */
  private async convertUrlToDataUrlWithFetch(url: string): Promise<string> {
    try {
      const response = await axios.get(this.sanitizeAndEncodeUrl(url), {
        responseType: 'arraybuffer',
        timeout: 10000,
        httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
      });

      return this.convertToDataUrl(Buffer.from(response.data, 'binary'));
    } catch (error) {
      this.logger.log(`URL -> data URL 변환 실패: ${error}`, 'error');
      return url;
    }
  }

  /**
   * 페이지 스크린샷 생성
   */
  public async takePageScreenshot(page: any): Promise<string> {
    const screenshotPath = path.join(this.tempDir, `${uuidv4()}.png`);

    try {
      await page.screenshot({ path: screenshotPath, fullPage: true });

      const imageBuffer = fs.readFileSync(screenshotPath);
      return this.convertToDataUrl(imageBuffer);
    } finally {
      if (fs.existsSync(screenshotPath)) {
        fs.unlinkSync(screenshotPath);
      }
    }
  }
}
