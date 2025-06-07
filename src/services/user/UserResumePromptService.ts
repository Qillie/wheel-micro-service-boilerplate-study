import UserResumePromptTable from '../../models/main/UserResumePromptTable';

const DEFAULT_RESUME = `이름: 최연우\n\n학력:\n- 동국대학교 컴퓨터공학 석사 (논문: A Study on Synthetic Data Generation for Fall Detection, GPA: 4.19/4.5, 2022.03-2024.02)\n- 공주대학교 컴퓨터공학 학사 (GPA: 3.51/4.5, 2016.03-2022.02)\n\n경력:\n- 석사 연구원, 동국대학교 Computer Security & Distributed Computing Lab (2022.07-2024.02)\n  다중센서 융합 기반 유치장 특화 지능형 CCTV 시스템 연구 개발, ST-GCN 모델 적용으로 낙상 탐지 Top-1 정확도 83% 달성\n- 연구원, 동국대학교 Computer Security & Distributed Computing Lab (2023.04-2023.10)\n  안전한 S/W 제작 기술 고도화 연구, 보안 이론 및 실습 콘텐츠 8건 개발\n\n학술 발표:\n- A Study on Synthetic Data Generation for Fall Detection, ICEIC 2024 (Taipei)\n- A Study on Synthetic Data Generation for Fall Detection, IFSA 2023 (Daegu)\n- Design of Crowdsourcing Method for Minimizing Blind Spot of CCTV Based on Blockchain, ICFICE 2023 (Nha Trang)\n\n특허:\n- 낙상 탐지를 위한 데이터 생성 장치 및 방법, KR-Registration No. 10-2759464, 발명자: 정준호, 최연우, 김봉준\n\n기술 스택:\n- 딥러닝/머신러닝: PyTorch, TensorFlow, Keras, ST-GCN, YOLO, ViT, LLM, NLP, Agentic RAG, MCP\n- 웹 개발: Flask, Node.js, Vue.js, React.js, HTML/CSS, JavaScript\n- 데이터 분석: Pandas, NumPy, Scipy, Matplotlib, Seaborn, Scikit-learn\n- 기타: Unreal Engine 4, Docker, k8s, Amazon EC2, MySQL, Oracle VirtualBox, Git\n\n프로젝트 경험:\n- 다중센서 융합 기반 유치장 특화 지능형 CCTV 시스템 개발 (ST-GCN, PyTorch, Unreal Engine 4)\n- 낚시 입문자를 위한 금어기 판별 AI 웹 서비스 (YOLOv11, Flask, Node.js, Vue.js, AWS EC2)\n- 일산 신도시 미래 투자 가치 탐색 (Pandas, Numpy, Matplotlib)\n- 안전한 S/W 제작 기술 고도화 연구 (CWE Top 25, OWASP Top 10)\n\n수상 경력:\n- 실무 프로젝트 중심 AI 웹 서비스 개발자 양성과정 표창장, 멋쟁이사자처럼 (2025)\n- 스마트 치안 데이터 활용 및 응용서비스 공모전 대상/최우수상, 한국스마트치안학회 (2021)\n- K-사이버 시큐리티 웰런지 (AI 기반 악성코드 탐지 지역예선 1등), 한국인터넷진흥원 (2020)\n\n희망 사항:\n- 희망 분야: AI/ML, Agentic RAG, LLM\n- 선호 기업 규모: 중견기업 이상\n- 관심 산업: 금융, 방산, 게임, AI/ML\n- 거주지: 경기도 양주시\n- 고용형태: 정규직\n\n관련 링크:\n- 포트폴리오: https://twoimo.blog/resume/Yeonwoo_Choi_Portfolio.pdf\n- 금어기 판별 AI: https://github.com/SnapishAgent/Snapish\n- 일산 신도시 투자 가치 분석: https://github.com/SnapishAgent/Ilsan-Investment-Insight\n`;

const DEFAULT_PROMPT = `당신은 사람인의 채용공고와 구직자를 연결하는 전문 AI 채용매칭 어시스턴트입니다. 아래 지침을 반드시 따르세요.\n\n- 채용공고와 구직자 프로필만을 기반으로 적합성을 평가합니다.\n- AI/ML/DATA 직무에 우선순위를 두고, 직무 적합성, 기술 스택, 경력, 지역, 기업 규모, 산업 분야를 정량적으로 평가하세요.\n- 오직 입력 데이터만 사용하며, 추가 추론이나 가정은 금지합니다.\n- 반드시 아래 JSON 템플릿만 출력하고, 기타 텍스트나 설명은 절대 포함하지 마세요.\n\n[\n  {\n    "id": 채용공고 ID (정수),\n    "score": 종합 점수 (정수),\n    "reason": "핵심 적합성 요인 1~3개 요약",\n    "strength": "지원자의 강점과 직무의 연관성",\n    "weakness": "지원자와 직무 간의 불일치 요인",\n    "apply_yn": true 또는 false\n  }\n]`;

export class UserResumePromptService {
    static async getResumePrompt(userId: string) {
        const user = await UserResumePromptTable.findOne({ where: { user_id: userId } });
        if (!user) {
            return { user_id: userId, resume: DEFAULT_RESUME, prompt: DEFAULT_PROMPT, updated_at: new Date() };
        }
        return user;
    }

    static async upsertResumePrompt(userId: string, resume: string, prompt: string) {
        return await UserResumePromptTable.upsert({
            user_id: userId,
            resume,
            prompt,
            updated_at: new Date(),
        });
    }
} 