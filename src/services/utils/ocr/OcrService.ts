import { Mistral } from '@mistralai/mistralai';
import { sleep } from "@qillie/wheel-micro-service";
import { LoggerService } from '../logging/LoggerService';
import { ImageProcessor } from '../image/ImageProcessor';

/**
 * OCR 서비스 - 이미지에서 텍스트 추출 및 텍스트 정제 담당
 */
export class OcrService {
  private mistralClient: Mistral | null = null;
  private readonly logger: LoggerService;
  private readonly imageProcessor: ImageProcessor;

  constructor(
    apiKey: string | undefined,
    logger: LoggerService,
    imageProcessor: ImageProcessor
  ) {
    this.logger = logger;
    this.imageProcessor = imageProcessor;
    this.initializeClient(apiKey);
  }

  /**
   * Mistral API 클라이언트 초기화
   */
  private initializeClient(apiKey: string | undefined): void {
    if (apiKey) {
      try {
        this.mistralClient = new Mistral({ apiKey });
        this.logger.log('Mistral AI API 클라이언트 초기화 완료', 'success');
      } catch (error) {
        this.logger.log(`Mistral AI API 클라이언트 초기화 실패: ${error}`, 'error');
        this.mistralClient = null;
      }
    } else {
      this.logger.log('Mistral API 키가 제공되지 않았습니다', 'warning');
    }
  }

  /**
   * OCR을 사용하여 이미지에서 텍스트 추출
   */
  public async processImageWithOCR(imageUrl: string): Promise<string> {
    if (!imageUrl || (!imageUrl.startsWith('data:image') && !imageUrl.startsWith('https://'))) {
      this.logger.log('OCR 입력값이 유효하지 않음, 건너뜀', 'warning');
      return '';
    }
    if (!this.mistralClient) {
      throw new Error('Mistral API 클라이언트가 초기화되지 않음');
    }

    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        // 이미지 URL 처리
        let processedImageUrl = imageUrl;
        if (!imageUrl.startsWith('data:image')) {
          try {
            processedImageUrl = await this.imageProcessor.resizeImageIfNeeded(imageUrl);
          } catch (resizeError) {
            this.logger.log(`이미지 처리 중 오류, 원본 URL 사용: ${resizeError}`, 'warning');
          }
        }

        // OCR API 호출
        const ocrResponse = await this.mistralClient.ocr.process({
          model: "mistral-ocr-latest",
          document: {
            type: "image_url",
            imageUrl: processedImageUrl,
          }
        });

        // 결과 추출
        let extractedText = '';
        if (ocrResponse.pages && ocrResponse.pages.length > 0) {
          extractedText = ocrResponse.pages.map(page => page.markdown).join('\n\n');
        }

        return extractedText;
      } catch (error: any) {
        return await this.handleOcrError(error, imageUrl, attempt, maxRetries);
      } finally {
        attempt++;
      }
    }

    throw new Error('OCR 처리 실패: 최대 재시도 횟수 초과');
  }

  /**
   * OCR 오류 처리
   */
  private async handleOcrError(
    error: any,
    imageUrl: string,
    attempt: number,
    maxRetries: number
  ): Promise<string> {
    // API 오류 상세 로깅
    if (error.statusCode) {
      this.logger.log(`OCR API 오류(${error.statusCode}): ${error.message}`, 'warning');
    }

    // 속도 제한이나 서버 오류의 경우 재시도
    if (error.statusCode === 429 || error.statusCode === 500 || error.statusCode === 503) {
      if (attempt < maxRetries - 1) {
        this.logger.log(`일시적 서버 오류, 재시도 중... (${attempt + 1}/${maxRetries})`, 'warning');
        await sleep(2000 * (attempt + 1)); // 지수 백오프
        return ""; // 다음 시도로 이동
      }
    }
    // 잘못된 이미지 URL - 다른 방식으로 재시도
    else if (error.statusCode === 400 && error.message?.includes('invalid_file')) {
      if (attempt < maxRetries - 1) {
        this.logger.log(`잘못된 이미지 URL, data URL 변환 시도...`, 'warning');
        try {
          // 이미지가 존재하는지 먼저 확인 (ImageProcessor에서 이미 체크되지만 명시적으로 처리)
          if (imageUrl.includes('//upload/') && (
            imageUrl.includes('404') ||
            error.message.includes('not found') ||
            error.message.includes('404')
          )) {
            this.logger.log(`이미지가 존재하지 않는 것으로 판단됨 (404). 재시도 중단`, 'warning');
            throw new Error('이미지를 찾을 수 없음 (404)');
          }

          const dataUrl = await this.imageProcessor.resizeImageIfNeeded(imageUrl);

          // 변환된 URL이 원본과 같거나 비어있으면 재시도 중단
          if (!dataUrl || dataUrl === imageUrl) {
            this.logger.log(`이미지 변환 실패, 재시도 중단`, 'warning');
            throw new Error('이미지 변환 실패');
          }

          // 다음 시도에서 data URL 사용
          return await this.processImageWithOCR(dataUrl);
        } catch (conversionError: any) {
          this.logger.log(`이미지 변환 중 오류: ${conversionError.message}. 추가 재시도 중단`, 'warning');
          // 변환 실패 시 더 이상 재시도하지 않고 오류 전파
          throw new Error(`이미지 처리 실패: ${conversionError.message || '알 수 없는 오류'}`);
        }
      }
    }

    throw error; // 다른 오류는 바로 전파
  }

  /**
   * 텍스트 정리 및 개선
   */
  public async improveTextWithMistral(text: string): Promise<string> {
    if (!text || text.length < 10) return text;
    if (!this.mistralClient) return text;

    const maxRetries = 3;
    let retryCount = 0;
    let backoffTime = 2000; // 시작 대기 시간 2초

    while (retryCount <= maxRetries) {
      try {
        if (retryCount > 0) {
          this.logger.log(`Mistral API 요청 재시도 중... (${retryCount}/${maxRetries})`, 'warning');
        }

        this.logger.logVerbose('Mistral AI를 사용하여 텍스트 개선 중...');

        const prompt = this.buildTextImprovementPrompt(text);

        const response = await this.mistralClient.chat.complete({
          model: "mistral-small-latest",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1, // 낮은 온도로 일관된 결과 유도
          maxTokens: 4096  // 충분한 토큰 할당
        });

        const content = response?.choices?.[0]?.message?.content || text;
        return this.processResponseContent(content);
      } catch (error: any) {
        if (this.isRateLimitError(error)) {
          if (retryCount < maxRetries) {
            this.logger.log(`속도 제한으로 인한 오류, ${backoffTime / 1000}초 후 재시도...`, 'warning');
            await sleep(backoffTime);
            backoffTime *= 2; // 지수 백오프
            retryCount++;
          } else {
            this.logger.log(`최대 재시도 횟수(${maxRetries})에 도달. 원본 텍스트 반환`, 'error');
            return text;
          }
        } else {
          this.logger.log('Mistral AI 텍스트 개선 중 오류: ' + error, 'error');
          return text; // 다른 오류는 원본 반환
        }
      }
    }

    return text; // 모든 시도 실패 시 원본 반환
  }

  /**
   * 속도 제한 오류인지 확인
   */
  private isRateLimitError(error: any): boolean {
    return error.statusCode === 429 ||
      (error.message && error.message.includes("rate limit"));
  }

  /**
   * 텍스트 개선 프롬프트 생성
   */
  private buildTextImprovementPrompt(text: string): string {
    return `
      당신은 채용 공고 텍스트를 깔끔하게 정리하는 전문가입니다. 
      다음 텍스트는 OCR 또는 웹 스크래핑으로 추출된 채용 공고입니다. 
      이 텍스트를 보기 좋고 이해하기 쉬운 형태로 정리해주세요.

      텍스트를 정리할 때 다음 규칙을 따라주세요:
      1. 무의미한 특수 문자, 기호, 랜덤 문자를 제거하세요.
      2. 테이블 형식은 일반 텍스트로 변환하세요.
      3. 문단과 구조를 자연스럽게 유지하세요.
      4. 채용 정보의 핵심 내용(직무 설명, 자격 요건, 우대사항, 복리후생 등)은 반드시 유지하세요.
      5. 이메일, URL, 회사명, 지원 방법 등 중요 정보는 정확히 보존하세요.
      6. 전체 내용을 요약하지 말고, 불필요한 텍스트만 제거하여 가능한 원본의 모든 정보를 유지하세요.
      7. 마크다운 형식으로 반환하지 말고, 문서 서식을 유지하면서 반환하세요.
      8. 답변은 결과 텍스트만 반환하면 됩니다. 추가 설명이나 주석은 필요하지 않습니다.

      텍스트:${text}

      다음은 적절한 변환 예시입니다:

      예시 1:
      원문: "■ 모집부문 ■ \n-백엔드 개발자@@ \n**경력 3~5년차**\n~~~ 자격요건 ~~~\n- JAVA/Spring 프레임워크 경험\n- MySQL 활용 경험\n***우대사항***\nㅁㄴㅇㄹ\n- AWS 클라우드 서비스 경험"
      변환: "모집부문: 백엔드 개발자\n경력: 3~5년차\n\n자격요건:\n- JAVA/Spring 프레임워크 경험\n- MySQL 활용 경험\n\n우대사항:\n- AWS 클라우드 서비스 경험"

      예시 2:
      원문: "|직무|요구사항|우대사항|\n|---|---|---|\n|프론트엔드|React 경험자|TypeScript 능숙자|\n|백엔드|Node.js 경험자|AWS 경험자|\n\n### 지원방법 ###\n이력서 제출 : recruit@company.com\n마감일 : 2023.05.31"
      변환: "직무: 프론트엔드\n요구사항: React 경험자\n우대사항: TypeScript 능숙자\n\n직무: 백엔드\n요구사항: Node.js 경험자\n우대사항: AWS 경험자\n\n지원방법:\n이력서 제출: recruit@company.com\n마감일: 2023.05.31"

      예시 3:
      원문: "☆★☆★ 채용공고 ☆★☆★\n▶▶▶ 주요 업무\n- 데이터 분석\n- 머신러닝 모델 개발\n- 데이터 파이프라인 구축\n\n▶▶▶ 자격 요건\n- 파이썬 고급 사용 가능\n- SQL 능숙\n\n▶▶▶ 근무 조건\n- 연봉: 협의\n- 위치: 서울시 강남구\n- 문의처: 02-123-4567\nhttp://company.com/apply"
      변환: "주요 업무:\n- 데이터 분석\n- 머신러닝 모델 개발\n- 데이터 파이프라인 구축\n\n자격 요건:\n- 파이썬 고급 사용 가능\n- SQL 능숙\n\n근무 조건:\n- 연봉: 협의\n- 위치: 서울시 강남구\n- 문의처: 02-123-4567\n- 지원 링크: http://company.com/apply"
    `;
  }

  /**
   * API 응답 내용 처리
   */
  private processResponseContent(content: any): string {
    if (typeof content === 'string') {
      return content.trim();
    } else if (Array.isArray(content)) {
      return content
        .map(chunk => {
          if (typeof chunk === 'string') return chunk;
          if ('text' in chunk && typeof chunk.text === 'string') return chunk.text;
          return '';
        })
        .join('')
        .trim();
    }
    return String(content).trim();
  }

  /**
   * 텍스트 정리 (정규식 처리)
   */
  public cleanJobDescription(text: string): string {
    if (!text) return '';

    let cleaned = text;

    // HTML 태그 제거
    cleaned = cleaned.replace(/<[^>]*>/g, ' ');

    // HTML 엔티티 디코딩
    cleaned = cleaned.replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    // 한글 자음/모음만 있는 무의미한 패턴 제거
    cleaned = cleaned.replace(/[ㄱ-ㅎㅏ-ㅣ]{2,}/g, '');

    // 마크다운 헤더 형식 정리
    cleaned = cleaned.replace(/^#+\s+/gm, '');

    // 테이블 포맷 정리
    cleaned = cleaned.replace(/\|[\s-:|]*\|/g, '\n'); // 테이블 구분선 제거
    cleaned = cleaned.replace(/\|\s*([^|]*)\s*\|/g, '$1\n'); // 테이블 셀 텍스트 추출

    // LaTeX 스타일 문법 정리
    cleaned = cleaned.replace(/\$\\checkmark\$/g, '✓');
    cleaned = cleaned.replace(/\$(\d+)\s*\\%\$/g, '$1%');

    // 연속된 공백 문자를 단일 공백으로 치환
    cleaned = cleaned.replace(/\s+/g, ' ');

    // 연속된 줄바꿈을 최대 2개로 제한
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    // 불필요한 특수문자 패턴 제거
    cleaned = cleaned.replace(/[^\S\n]+\n/g, '\n')
      .replace(/\n[^\S\n]+/g, '\n');

    // 문단 시작의 불필요한 기호 제거
    cleaned = cleaned.replace(/^[\s-•*▶■●★☆◆□]+/gm, '');

    // URL과 이메일 형식 정리
    cleaned = cleaned.replace(/(https?:\/\/[^\s]+)/g, ' $1 ');
    cleaned = cleaned.replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, ' $1 ');

    // 중복 공백 제거
    cleaned = cleaned.replace(/\s+/g, ' ');

    // 줄 시작과 끝의 공백 제거
    cleaned = cleaned.replace(/^\s+|\s+$/gm, '');

    // 전체 텍스트 앞뒤 공백 제거
    return cleaned.trim();
  }
}
