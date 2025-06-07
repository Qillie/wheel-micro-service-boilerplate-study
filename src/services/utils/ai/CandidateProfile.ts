import { CandidateProfile } from './types/CandidateTypes';

/**
 * 최연우 구직자의 기본 프로필 정보
 */
export const getDefaultCandidateProfile = (): CandidateProfile => {
  return {
    name: '최연우',
    education: [
      {
        degree: '석사',
        major: '컴퓨터공학 (논문: A Study on Synthetic Data Generation for Fall Detection, GPA: 4.19/4.5)',
        school: '동국대학교',
        period: '2022.03-2024.02'
      },
      {
        degree: '학사',
        major: '컴퓨터공학 (GPA: 3.51/4.5)',
        school: '공주대학교',
        period: '2016.03-2022.02'
      }
    ],
    experience: [
      {
        role: '석사 연구원',
        company: '동국대학교 Computer Security & Distributed Computing Lab',
        period: '2022.07-2024.02',
        description: '다중센서 융합 기반 유치장 특화 지능형 CCTV 시스템 연구 개발, ST-GCN 모델 적용으로 낙상 탐지 Top-1 정확도 83% 달성'
      },
      {
        role: '연구원',
        company: '동국대학교 Computer Security & Distributed Computing Lab',
        period: '2023.04-2023.10',
        description: '안전한 S/W 제작 기술 고도화 연구, 보안 이론 및 실습 콘텐츠 8건 개발'
      }
    ],
    skills: {
      ai_ml: ['PyTorch', 'TensorFlow', 'Keras', 'ST-GCN', 'YOLO', 'ViT', 'LLM', 'NLP', 'Agentic RAG', 'MCP'],
      web_dev: ['Flask', 'Node.js', 'Vue.js', 'React.js', 'HTML/CSS', 'JavaScript'],
      data_analysis: ['Pandas', 'NumPy', 'Scipy', 'Matplotlib', 'Seaborn', 'Scikit-learn'],
      others: ['Unreal Engine 4', 'Docker', 'k8s', 'Amazon EC2', 'MySQL', 'Oracle VirtualBox', 'Git']
    },
    projects: [
      {
        title: '다중센서 융합 기반 유치장 특화 지능형 CCTV 시스템 개발 - 경찰서 유치장 환경에 특화된 낙상 탐지 시스템 개발. ST-GCN 모델 적용으로 낙상 탐지 정확도 83% 달성. 언리얼 엔진 기반 합성 데이터 생성 자동화로 학습 데이터 생성 시간 2배 단축.',
        tech: 'ST-GCN, PyTorch, Unreal Engine 4'
      },
      {
        title: '낚시 입문자를 위한 금어기 판별 AI 웹 서비스 - 17개 금어종에 관한 1,500건 학습 데이터 확보 및 정제. 딥러닝 전이 학습 및 모델 경량화로 mAP50 기준 97% 정확도 달성. 웹 서비스 구현부터 배포까지 전체 개발 프로세스 주도.',
        tech: 'YOLOv11, Flask, Node.js, Vue.js, AWS EC2'
      },
      {
        title: '일산 신도시 미래 투자 가치 탐색 - 1기 신도시 재건축 대상 지역 분석. 공공 및 민간 데이터 결합한 분석 방법 적용. 재건축 대상 지역의 잠재 가치 및 위험 요소를 정량적 분석.',
        tech: 'Pandas, Numpy, Matplotlib'
      },
      {
        title: '안전한 S/W 제작 기술 고도화 연구 - 보안 이론과 실습 콘텐츠 8건 고도화. 코드 백업 및 원상 복구 기능 도입. 국가공공기관 공무원 대상 이론/실습 강의 2회 보조.',
        tech: 'CWE Top 25, OWASP Top 10'
      }
    ],
    preferences: {
      fields: [
        'AI/ML',
        'Agentic RAG',
        'LLM'
      ],
      company_size: '중견기업 이상',
      industries: ['금융', '방산', '게임', 'AI/ML'],
      location: '경기도 양주시',
      job_type: '정규직'
    }
  };
};

/**
 * 구직자 프로필을 문자열로 포맷팅하는 함수
 */
export const formatCandidateProfile = (profile: CandidateProfile): string => {
  let profileText = `이름: ${profile.name}\n\n`;

  // 학력
  profileText += '학력:\n';
  for (const edu of profile.education) {
    profileText += `- ${edu.school} ${edu.major} ${edu.degree} (${edu.period})\n`;
  }
  profileText += '\n';

  // 경력
  profileText += '경력:\n';
  for (const exp of profile.experience) {
    profileText += `- ${exp.role}, ${exp.company} (${exp.period})\n  ${exp.description}\n`;
  }
  profileText += '\n';

  // 추가 학술 정보
  profileText += '학술 발표:\n';
  profileText += '- A Study on Synthetic Data Generation for Fall Detection, The 23rd International Conference on Electronics, Information, and Communication (ICEIC) (2024, Taipei, Taiwan)\n';
  profileText += '- A Study on Synthetic Data Generation for Fall Detection, The 20th World Congress of the International Fuzzy Systems Association (IFSA) (2023, Daegu, Korea)\n';
  profileText += '- Design of Crowdsourcing Method for Minimizing Blind Spot of CCTV Based on Blockchain, The 15th International Conference on Future Information & Communication Engineering (ICFICE) (2023, Nha Trang, Vietnam) - Poster\n\n';

  // 특허 정보
  profileText += '특허:\n';
  profileText += '- 낙상 탐지를 위한 데이터 생성 장치 및 방법, KR-Registration No. 10-2759464, 발명자: 정준호, 최연우, 김봉준\n\n';

  // 기술 스택
  profileText += '기술 스택:\n';
  profileText += `- 딥러닝/머신러닝: ${profile.skills.ai_ml.join(', ')}\n`;
  profileText += `- 웹 개발: ${profile.skills.web_dev.join(', ')}\n`;
  profileText += `- 데이터 분석: ${profile.skills.data_analysis.join(', ')}\n`;
  profileText += `- 기타: ${profile.skills.others.join(', ')}\n\n`;

  // 프로젝트 경험
  profileText += '프로젝트 경험:\n';
  for (const proj of profile.projects) {
    profileText += `- ${proj.title} (${proj.tech})\n`;
  }
  profileText += '\n';

  // 수상 경력
  profileText += '수상 경력:\n';
  profileText += '- 실무 프로젝트 중심 AI 웹 서비스 개발자 양성과정 표창장, 멋쟁이사자처럼 (2025)\n';
  profileText += '- 스마트 치안 데이터 활용 및 응용서비스 공모전 대상/최우수상, 한국스마트치안학회 (2021)\n';
  profileText += '- K-사이버 시큐리티 웰런지 (AI 기반 악성코드 탐지 지역예선 1등), 한국인터넷진흥원 (2020)\n\n';

  // 희망 사항
  profileText += '희망 사항:\n';
  profileText += `- 희망 분야: ${profile.preferences.fields.join(', ')}\n`;
  profileText += `- 선호 기업 규모: ${profile.preferences.company_size}\n`;
  profileText += `- 관심 산업: ${profile.preferences.industries.join(', ')}\n`;
  profileText += `- 거주지: ${profile.preferences.location}\n`;
  profileText += `- 고용형태: ${profile.preferences.job_type}\n\n`;

  // 관련 링크
  profileText += '관련 링크:\n';
  profileText += '- 포트폴리오 상세: https://twoimo.blog/resume/Yeonwoo_Choi_Portfolio.pdf\n';
  profileText += '- 낚시 입문자를 위한 금어기 판별 AI 웹 서비스: https://github.com/SnapishAgent/Snapish\n';
  profileText += '- 일산 신도시 투자 가치 분석: https://github.com/SnapishAgent/Ilsan-Investment-Insight\n';

  return profileText;
};
