import fs from 'fs';
import path from 'path';
import { LoggerService } from '../logging/LoggerService';

/**
 * 파일 시스템 작업을 위한 헬퍼 클래스
 */
export class FileHelper {
  /**
   * 디렉토리가 존재하는지 확인하고 없으면 생성
   */
  public static ensureDirectoryExists(directoryPath: string): void {
    if (!fs.existsSync(directoryPath)) {
      fs.mkdirSync(directoryPath, { recursive: true });
    }
  }

  /**
   * 파일에 JSON 데이터 저장
   */
  public static saveJsonToFile(
    filePath: string, 
    data: any, 
    logger?: LoggerService
  ): boolean {
    try {
      // 디렉토리 확인 및 생성
      const dirPath = path.dirname(filePath);
      this.ensureDirectoryExists(dirPath);
      
      // JSON 데이터 저장
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      
      if (logger) {
        logger.log(`파일 저장 완료: ${filePath}`, 'success');
      }
      
      return true;
    } catch (error) {
      if (logger) {
        logger.log(`파일 저장 실패: ${error}`, 'error');
      }
      return false;
    }
  }

  /**
   * 파일에서 JSON 데이터 로드
   */
  public static loadJsonFromFile<T>(
    filePath: string,
    defaultValue: T,
    logger?: LoggerService
  ): T {
    try {
      // 파일 존재 확인
      if (!fs.existsSync(filePath)) {
        if (logger) {
          logger.log(`파일이 존재하지 않습니다: ${filePath}`, 'warning');
        }
        return defaultValue;
      }
      
      // 파일 읽기 및 파싱
      const fileData = fs.readFileSync(filePath, 'utf8');
      const parsedData = JSON.parse(fileData) as T;
      
      if (logger) {
        logger.log(`파일 로드 완료: ${filePath}`, 'info');
      }
      
      return parsedData;
    } catch (error) {
      if (logger) {
        logger.log(`파일 로드 실패: ${error}`, 'error');
      }
      return defaultValue;
    }
  }

  /**
   * 임시 파일 생성
   */
  public static createTempFile(
    fileName: string,
    data: string,
    tempDir: string = 'temp'
  ): string {
    const tempDirPath = path.join(process.cwd(), tempDir);
    
    // 임시 디렉토리 확인 및 생성
    this.ensureDirectoryExists(tempDirPath);
    
    // 파일 경로 생성
    const filePath = path.join(tempDirPath, fileName);
    
    // 파일 쓰기
    fs.writeFileSync(filePath, data);
    
    return filePath;
  }

  /**
   * 파일 삭제
   */
  public static deleteFile(filePath: string): boolean {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`파일 삭제 실패: ${error}`);
      return false;
    }
  }

  /**
   * 파일 읽기 스트림 생성
   */
  public static createReadStream(filePath: string): fs.ReadStream {
    if (!fs.existsSync(filePath)) {
      throw new Error(`파일이 존재하지 않습니다: ${filePath}`);
    }
    return fs.createReadStream(filePath);
  }

  /**
   * 파일 쓰기 스트림 생성
   */
  public static createWriteStream(filePath: string): fs.WriteStream {
    // 디렉토리 확인 및 생성
    const dirPath = path.dirname(filePath);
    this.ensureDirectoryExists(dirPath);
    
    return fs.createWriteStream(filePath);
  }
}
