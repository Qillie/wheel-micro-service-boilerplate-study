import { ModelABC } from "@qillie/wheel-micro-service";
import { Table, AllowNull, Column, DataType } from "sequelize-typescript";

@Table({
  freezeTableName: true,
  tableName: "company_recruitment",
})
export default class CompanyRecruitmentTable extends ModelABC {
  
  // ID 필드는 일반적으로 ModelABC에서 처리되지만, 요청에 따라 명시적으로 포함됨
  
  @AllowNull(false)
  @Column({
    type: DataType.STRING,
    comment: "회사명",
  })
  company_name!: string;
  
  @AllowNull(false)
  @Column({
    type: DataType.STRING,
    comment: "채용 공고 제목",
  })
  job_title!: string;
  
  @AllowNull(true)
  @Column({
    type: DataType.TEXT('long'),
    comment: "채용 공고 상세 내용 (텍스트 또는 OCR로 추출된 내용)",
  })
  job_description!: string;
  
  @AllowNull(true)
  @Column({
    type: DataType.TEXT,
    comment: "채용 공고 URL",
  })
  job_url!: string;
  
  @AllowNull(true)
  @Column({
    type: DataType.STRING,
    comment: "근무 지역",
  })
  job_location!: string;
  
  @AllowNull(true)
  @Column({
    type: DataType.STRING,
    comment: "근무형태",
  })
  employment_type!: string;
  
  @AllowNull(true)
  @Column({
    type: DataType.STRING,
    comment: "급여 정보",
  })
  job_salary!: string;
  
  // 지원 조건 관련 정보
  @AllowNull(true)
  @Column({
    type: DataType.STRING,
    comment: "경력 조건",
  })
  job_type!: string;
  
  @AllowNull(true)
  @Column({
    type: DataType.STRING,
    comment: "마감일",
  })
  deadline!: string;
  
  // 회사 관련 정보
  @AllowNull(true)
  @Column({
    type: DataType.STRING,
    comment: "기업형태",
  })
  company_type!: string;
  
  // 메타데이터 및 상태 정보
  @AllowNull(false)
  @Column({
    type: DataType.DATE,
    comment: "데이터 수집 일시",
    defaultValue: DataType.NOW,
  })
  scraped_at!: Date;
  
  @AllowNull(true)
  @Column({
    type: DataType.BOOLEAN,
    comment: "GPT 체크 여부",
    defaultValue: false,
  })
  is_gpt_checked!: boolean;
  
  @AllowNull(true)
  @Column({
    type: DataType.BOOLEAN,
    comment: "지원 여부",
    defaultValue: false,
  })
  is_applied!: boolean;
  
  // 매칭 결과 관련 필드
  @AllowNull(true)
  @Column({
    type: DataType.INTEGER,
    comment: "매칭 점수 (0-100)",
  })
  match_score!: number;
  
  @AllowNull(true)
  @Column({
    type: DataType.TEXT,
    comment: "매칭 이유",
  })
  match_reason!: string;
  
  @AllowNull(true)
  @Column({
    type: DataType.TEXT,
    comment: "지원자의 강점",
  })
  strength!: string;
  
  @AllowNull(true)
  @Column({
    type: DataType.TEXT,
    comment: "지원자와 직무 간 격차",
  })
  weakness!: string;
  
  @AllowNull(true)
  @Column({
    type: DataType.BOOLEAN,
    comment: "지원 추천 여부",
    defaultValue: false,
  })
  is_recommended!: boolean;
}
