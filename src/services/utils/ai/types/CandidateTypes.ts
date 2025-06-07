/**
 * 구직자 학력 정보
 */
export interface Education {
  degree: string;
  major: string;
  school: string;
  period: string;
}

/**
 * 구직자 경력 정보
 */
export interface Experience {
  role: string;
  company: string;
  period: string;
  description: string;
}

/**
 * 구직자 프로젝트 정보
 */
export interface Project {
  title: string;
  tech: string;
}

/**
 * 구직자 선호사항
 */
export interface Preferences {
  fields: string[];
  company_size: string;
  industries: string[];
  location: string;
  job_type: string;
}

/**
 * 구직자 기술 스택
 */
export interface Skills {
  ai_ml: string[];
  web_dev: string[];
  data_analysis: string[];
  others: string[];
}

/**
 * 구직자 전체 프로필
 */
export interface CandidateProfile {
  name: string;
  education: Education[];
  experience: Experience[];
  skills: Skills;
  projects: Project[];
  preferences: Preferences;
}
