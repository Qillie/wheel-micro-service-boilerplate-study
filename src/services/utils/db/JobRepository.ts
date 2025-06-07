import sequelize from "sequelize";
import { LoggerService } from "../logging/LoggerService";
import { JobInfo } from "../types/JobTypes";
import CompanyRecruitmentTable from "../../../models/main/CompanyRecruitmentTable";
import { JobMatchResult } from "../ai/JobMatchingService";

/**
 * 채용 정보 저장소 - 데이터베이스 작업 처리
 */
export class JobRepository {
  private logger: LoggerService;

  constructor(logger: LoggerService) {
    this.logger = logger;
  }

  /**
   * 채용 정보를 데이터베이스에 저장
   */
  public async saveJob(job: JobInfo, url: string): Promise<void> {
    try {
      await CompanyRecruitmentTable.create({
        company_name: job.companyName,
        job_title: job.jobTitle,
        job_location: job.jobLocation,
        job_type: job.jobType,
        job_salary: job.jobSalary,
        deadline: job.deadline,
        employment_type: job.employmentType || "",
        job_url: url,
        company_type: job.companyType || "",
        job_description: job.jobDescription || "",
        scraped_at: new Date(),
        is_applied: false
      });

      this.logger.logVerbose(`채용 정보 저장: ${job.companyName} - ${job.jobTitle}`);
    } catch (error) {
      this.logger.log(`채용 정보 저장 실패: ${error}`, 'error');
      throw error;
    }
  }

  /**
   * 이미 존재하는 URL 목록 확인
   */
  public async checkExistingUrls(urls: string[]): Promise<string[]> {
    if (urls.length === 0) return [];

    try {
      const existingRecords = await CompanyRecruitmentTable.findAll({
        attributes: ['job_url'],
        where: {
          job_url: {
            [sequelize.Op.in]: urls
          }
        },
        raw: true
      });

      return existingRecords.map(record => record.job_url);
    } catch (error) {
      this.logger.log(`기존 URL 확인 중 오류: ${error}`, 'error');
      return [];
    }
  }

  /**
   * 채용 데이터 통계 생성
   */
  public createJobStatistics(jobs: JobInfo[]): {
    companyCounts: Record<string, number>,
    jobTypeCounts: Record<string, number>,
    employmentTypeCounts: Record<string, number>,
    topCompanies: [string, number][]
  } {
    const companyCounts: Record<string, number> = {};
    const jobTypeCounts: Record<string, number> = {};
    const employmentTypeCounts: Record<string, number> = {};

    jobs.forEach(job => {
      // 회사 카운트
      const company = job.companyName;
      companyCounts[company] = (companyCounts[company] || 0) + 1;

      // 직무 유형 카운트
      const jobType = job.jobType || '명시되지 않음';
      jobTypeCounts[jobType] = (jobTypeCounts[jobType] || 0) + 1;

      // 고용 형태 카운트
      const empType = job.employmentType || '명시되지 않음';
      employmentTypeCounts[empType] = (employmentTypeCounts[empType] || 0) + 1;
    });

    // 상위 회사 목록
    const topCompanies = Object.entries(companyCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      companyCounts,
      jobTypeCounts,
      employmentTypeCounts,
      topCompanies
    };
  }

  /**
   * DB raw 객체를 JobInfo로 변환하는 헬퍼
   */
  private toJobInfo(job: any): JobInfo {
    return {
      id: Number(job.id),
      score: Number(job.match_score ?? 0),
      reason: job.match_reason ?? '',
      strength: job.strength ?? '',
      weakness: job.weakness ?? '',
      apply_yn: job.is_recommended ?? false,
      companyName: job.company_name,
      jobTitle: job.job_title,
      jobLocation: job.job_location || '',
      jobType: job.job_type || '',
      jobSalary: job.job_salary || '',
      deadline: job.deadline || '',
      employmentType: job.employment_type || '',
      url: job.job_url || '',
      companyType: job.company_type || '',
      jobDescription: job.job_description || '',
      descriptionType: 'text',
      scrapedAt: job.scraped_at ? job.scraped_at.toISOString() : new Date().toISOString()
    };
  }

  /**
   * 최근 채용 공고 가져오기
   */
  public async getRecentJobs(limit: number = 10): Promise<JobInfo[]> {
    try {
      const jobs = await CompanyRecruitmentTable.findAll({
        order: [['scraped_at', 'DESC']],
        limit,
        raw: true
      });
      return jobs.map(this.toJobInfo);
    } catch (error) {
      this.logger.log(`최근 채용 공고 조회 실패: ${error}`, 'error');
      return [];
    }
  }

  /**
   * 매칭 결과로 채용 공고 업데이트
   */
  public async updateJobWithMatchResult(
    jobId: number,
    matchScore: number,
    matchReason: string,
    isRecommended: boolean,
    strength?: string,
    weakness?: string
  ): Promise<boolean> {
    try {
      const job = await CompanyRecruitmentTable.findByPk(jobId);

      if (!job) {
        this.logger.log(`ID ${jobId}에 해당하는 채용 공고를 찾을 수 없습니다`, 'warning');
        return false;
      }

      // 매칭 결과 데이터 업데이트
      job.match_score = matchScore;
      job.match_reason = matchReason;
      job.is_recommended = isRecommended;
      job.is_gpt_checked = true;

      if (strength) job.strength = strength;
      if (weakness) job.weakness = weakness;

      await job.save();

      this.logger.logVerbose(`채용 공고 매칭 결과 업데이트 완료 (ID: ${jobId}, 점수: ${matchScore})`);
      return true;
    } catch (error) {
      this.logger.log(`매칭 결과 업데이트 실패 (ID: ${jobId}): ${error}`, 'error');
      return false;
    }
  }

  /**
   * 추천 채용 공고 가져오기
   */
  public async getRecommendedJobs(limit: number = 5): Promise<JobMatchResult[]> {
    try {
      const query: any = {
        where: {
          is_gpt_checked: true,
          is_recommended: true
        },
        order: [['match_score', 'DESC']],
        raw: true
      };
      if (limit > 0) {
        query.limit = limit;
      }
      const jobs = await CompanyRecruitmentTable.findAll(query);
      this.logger.log(`${jobs.length}개의 추천 채용 공고를 조회했습니다.`, 'info');
      if (jobs.length === 0) {
        this.logger.log('추천 채용 공고가 없습니다.', 'warning');
      }
      return jobs.map(job => ({
        ...this.toJobInfo(job),
        reason: job.match_reason || '',
        strength: job.strength || '',
        weakness: job.weakness || '',
        apply_yn: false
      }));
    } catch (error) {
      this.logger.log(`추천 채용 공고 조회 실패: ${error}`, 'error');
      return [];
    }
  }

  /**
   * 전체 채용 공고 가져오기
   * @param limit 페이지당 항목 수
   * @param page 페이지 번호
   * @returns 채용 정보 배열
   */
  public async getAllJobs(limit: number = 100, page: number = 1): Promise<any[]> {
    try {
      const offset = (page - 1) * limit;
      // 오늘 날짜 (YYYY-MM-DD)
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const todayStr = `${yyyy}-${mm}-${dd}`;

      // 마감일이 오늘 이후이거나, 마감일이 비어있는 경우만 조회
      const where = {
        [sequelize.Op.or]: [
          { deadline: null },
          { deadline: '' },
          sequelize.where(
            sequelize.fn('STR_TO_DATE', sequelize.col('deadline'), '%Y.%m.%d'), '>=', todayStr
          ),
          sequelize.where(
            sequelize.fn('STR_TO_DATE', sequelize.col('deadline'), '%Y-%m-%d'), '>=', todayStr
          )
        ]
      };
      const query: any = {
        where,
        order: [['scraped_at', 'DESC']],
        raw: true
      };
      if (limit > 0) {
        query.limit = limit;
        query.offset = offset;
      }
      const jobs = await CompanyRecruitmentTable.findAll(query);

      // 추천 채용공고 API와 유사한 로그 출력 추가
      this.logger.log(`${jobs.length}개의 전체 채용 공고를 조회했습니다. (페이지: ${page})`, 'info');
      if (jobs.length === 0) {
        this.logger.log(`페이지 ${page}에 채용 공고가 없습니다.`, 'warning');
      }

      this.logger.logVerbose(`전체 채용 공고 ${page} 페이지 (${jobs.length}개) 조회 완료`);

      // 테이블의 모든 컬럼을 그대로 반환하면서 클라이언트에 친숙한 필드명 추가
      return jobs.map(job => ({
        // 원본 DB 컬럼 유지
        ...job,

        // 클라이언트 친화적인 필드명 추가 (기존 호환성 유지)
        id: job.id,
        companyName: job.company_name,
        jobTitle: job.job_title,
        jobLocation: job.job_location || '',
        jobType: job.job_type || '',
        jobSalary: job.job_salary || '',
        deadline: job.deadline || '',
        employmentType: job.employment_type || '',
        url: job.job_url || '',
        companyType: job.company_type || '',
        jobDescription: job.job_description || '',
        descriptionType: 'text',
        scrapedAt: job.scraped_at ? job.scraped_at.toISOString() : new Date().toISOString(),
        matchScore: job.match_score,
        apply_yn: job.is_recommended,
        matchReason: job.match_reason || '',
        isApplied: job.is_applied,
        isGptChecked: job.is_gpt_checked,
        strength: job.strength || '',
        weakness: job.weakness || '',
        createdAt: job.created_at ? job.created_at.toISOString() : null,
        updatedAt: job.updated_at ? job.updated_at.toISOString() : null
      }));
    } catch (error) {
      this.logger.log(`전체 채용 공고 조회 중 오류: ${error}`, 'error');
      return [];
    }
  }

  /**
   * 매칭되지 않은 채용 공고 가져오기
   * is_gpt_checked가 false이거나 null인 항목만 조회
   * @param limit 가져올 최대 항목 수
   * @returns 매칭되지 않은 채용 정보 배열
   */
  public async getUnmatchedJobs(limit: number = 100): Promise<JobInfo[]> {
    try {
      const jobs = await CompanyRecruitmentTable.findAll({
        where: {
          is_gpt_checked: {
            [sequelize.Op.or]: [
              null,
              false
            ]
          }
        },
        order: [['id', 'ASC']],
        limit,
        raw: true
      });

      this.logger.logVerbose(`${jobs.length}개의 매칭되지 않은 채용 공고를 조회했습니다.`);

      // DB 모델을 JobInfo 형식으로 변환
      return jobs.map(job => ({
        id: job.id,
        companyName: job.company_name,
        jobTitle: job.job_title,
        jobLocation: job.job_location || '',
        score: 0, // Add default score field to match JobInfo interface
        jobType: job.job_type || '',
        jobSalary: job.job_salary || '',
        deadline: job.deadline || '',
        employmentType: job.employment_type || '',
        url: job.job_url || '',
        companyType: job.company_type || '',
        jobDescription: job.job_description || '',
        descriptionType: 'text',
        scrapedAt: job.scraped_at ? job.scraped_at.toISOString() : new Date().toISOString()
      }));
    } catch (error) {
      this.logger.log(`매칭되지 않은 채용 공고 조회 중 오류: ${error}`, 'error');
      return [];
    }
  }

  /**
   * 채용 공고의 매칭 상태 업데이트
   * @param jobIds 매칭 완료된 채용 공고 ID 배열
   * @returns 성공 여부
   */
  public async updateMatchedStatus(jobIds: number[]): Promise<boolean> {
    if (!jobIds.length) return true;

    try {
      await CompanyRecruitmentTable.update(
        { is_gpt_checked: true },
        {
          where: {
            id: {
              [sequelize.Op.in]: jobIds
            }
          }
        }
      );

      this.logger.logVerbose(`${jobIds.length}개 채용 공고의 매칭 상태가 업데이트되었습니다.`);
      return true;
    } catch (error) {
      this.logger.log(`채용 공고 매칭 상태 업데이트 중 오류: ${error}`, 'error');
      return false;
    }
  }

  /**
   * 매칭되지 않은 채용 공고 개수 조회
   * @returns 매칭되지 않은 채용 공고 수
   */
  public async countUnmatchedJobs(): Promise<number> {
    try {
      const result = await CompanyRecruitmentTable.count({
        where: {
          is_gpt_checked: {
            [sequelize.Op.or]: [
              null,
              false
            ]
          }
        }
      });

      this.logger.logVerbose(`매칭되지 않은 총 채용 공고 수: ${result}개`);
      return result;
    } catch (error) {
      this.logger.log(`매칭되지 않은 채용 공고 개수 조회 중 오류: ${error}`, 'error');
      return 0;
    }
  }
}
