import colors from 'ansi-colors';
import { ConfigService } from '../config/ConfigService';
import { LoggingConstants } from '../constants/AppConstants';

/**
 * 로그 레벨 타입
 */
type LogLevel = 'info' | 'success' | 'warning' | 'error' | 'debug';

/**
 * 로깅 서비스
 */
export class LoggerService {
  private configService: ConfigService;
  private logLevel: LogLevel;
  private verboseLogging: boolean;

  constructor(private consoleOutput: boolean = true, verbose: boolean = false) {
    this.configService = new ConfigService();
    this.logLevel = this.getLogLevelFromConfig();
    this.verboseLogging = verbose;
  }

  /**
   * 설정에서 로그 레벨 가져오기
   */
  private getLogLevelFromConfig(): LogLevel {
    const configLevel = this.configService.getLogLevel().toLowerCase();
    if (configLevel in LoggingConstants.PRIORITY) {
      return configLevel as LogLevel;
    }
    return LoggingConstants.DEFAULT_LEVEL as LogLevel;
  }

  /**
   * 로그 메시지 기록
   * @param message 로그 메시지
   * @param level 로그 레벨
   * @param forceDisplay 항상 표시 여부 (verbose 설정 무시)
   */
  public log(message: string, level: LogLevel = LoggingConstants.DEFAULT_LEVEL as LogLevel, forceDisplay: boolean = false): void {
    // 현재 설정된 레벨보다 우선순위가 낮으면 로깅하지 않음
    if (!this.verboseLogging && !forceDisplay && level === 'debug') {
      return;
    }

    const timestamp = new Date().toLocaleTimeString();
    let formattedMessage = `[${timestamp}]`;

    switch (level) {
      case 'info':
        formattedMessage = colors.cyan(`${formattedMessage} ${message}`);
        break;
      case 'success':
        formattedMessage = colors.green(`${formattedMessage} ${message}`);
        break;
      case 'warning':
        formattedMessage = colors.yellow(`${formattedMessage} ${message}`);
        break;
      case 'error':
        formattedMessage = colors.red(`${formattedMessage} ${message}`);
        break;
      case 'debug':
        formattedMessage = colors.gray(`${formattedMessage} ${message}`);
        break;
    }

    console.log(formattedMessage);
  }

  /**
   * 색상이 적용된 로그 출력
   */
  private printColoredLog(message: string, level: LogLevel): void {
    switch (level) {
      case LoggingConstants.LEVELS.DEBUG:
        console.debug(message);
        break;
      case LoggingConstants.LEVELS.INFO:
        console.info(message);
        break;
      case LoggingConstants.LEVELS.SUCCESS:
        console.log(colors.green(message));
        break;
      case LoggingConstants.LEVELS.WARNING:
        console.warn(colors.yellow(message));
        break;
      case LoggingConstants.LEVELS.ERROR:
        console.error(colors.red(message));
        break;
      default:
        console.log(message);
    }
  }

  /**
   * 로그 레벨 설정
   */
  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * 상세 로그 출력 모드 설정
   */
  public setVerbose(verbose: boolean): void {
    this.verboseLogging = verbose;
  }

  /**
   * 상세 로그 출력 (verbose 모드일 때만)
   */
  public logVerbose(message: string): void {
    if (this.verboseLogging) {
      console.log(colors.gray(`[DEBUG] ${message}`));
    }
  }

  /**
   * 구분선 출력 (로그 그룹 구분용)
   * @param char 구분선에 사용할 문자 (기본: -)
   */
  public logSeparator(char: string = '-'): void {
    const width = 80; // 터미널 너비에 맞게 조정
    const separator = char.repeat(width);
    console.log(colors.gray(separator));
  }
}
