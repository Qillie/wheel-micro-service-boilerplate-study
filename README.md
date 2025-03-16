# 5주차 스터디 내용 정리

## 1. 데이터베이스 연동 및 스마트 크롤링 기능 구현

`ScraperControlService`가 크롤링한 데이터를 효율적으로 관리하기 위해 데이터베이스 저장 기능을 추가하고, 더 스마트한 크롤링 로직을 구현했습니다.

### 1.1 채용정보 데이터베이스 저장 구현

```typescript
// 추출된 채용정보를 데이터베이스에 저장하는 코드
if (jobInfo) {
  // DB에 채용정보 저장 (scraped_at, is_applied 필드 추가)
  await CompanyRecruitmentTable.create({
    company_name: jobInfo.companyName,
    job_title: jobInfo.jobTitle,
    job_location: jobInfo.jobLocation,
    job_type: jobInfo.jobType,
    job_salary: jobInfo.jobSalary,
    deadline: jobInfo.deadline,
    job_url: url,
    scraped_at: new Date(), // 현재 시간으로 데이터 수집 일시 설정
    is_applied: false       // 초기 지원 여부는 false로 설정
  });
  
  console.log(`\n✅ 채용정보 추출 성공`);
  // 로깅 코드...
}
```

**핵심 구현 요소:**

1. **Sequelize ORM 활용**
   - TypeScript와 Sequelize를 활용하여 SQL 쿼리 없이 객체 형태로 데이터베이스 조작
   - `await` 키워드로 비동기 데이터베이스 작업 완료 대기
   - `create()` 메소드를 사용해 새 레코드 생성

2. **수집 메타데이터 저장**
   - `scraped_at`: 데이터 수집 시점을 저장하여 크롤링 이력 관리
   - `is_applied`, `is_gpt_checked`: 후속 처리 상태 추적을 위한 플래그

### 1.2 중복 방지 스마트 크롤링 구현

불필요한 리소스 낭비를 줄이기 위해 이미 수집된 채용정보는 건너뛰고, 중복이 많이 발견될 경우 크롤링을 자동으로 중단하는 로직을 구현했습니다.

```typescript
// URL을 기준으로 중복 체크 및 스크래핑 중단 로직
const existingJob = await CompanyRecruitmentTable.findOne({
  where: { job_url: fullUrl }
});

if (existingJob) {
  console.log(`🔄 이미 수집된 채용공고입니다: ${fullUrl}`);
  duplicatesInThisPage++;
  
  // 페이지 내 중복이 5개 이상이면 해당 페이지 스크래핑 중단
  if (duplicatesInThisPage >= 5) {
    console.log(`\n⚠️ 이 페이지에서 5개 이상의 중복된 채용공고가 발견되었습니다.`);
    continueScrapping = false;
    break;
  }
  
  continue; // 해당 채용공고 건너뛰기
}
```

**스마트 크롤링 전략:**

1. **URL 기반 중복 탐지**
   - 데이터베이스에 이미 존재하는 URL인지 확인하여 중복 수집 방지
   - 채용공고 URL을 유니크 식별자로 활용

2. **자동 중단 임계값 설정**
   - 한 페이지에서 5개 이상 중복 발견 시 해당 페이지 크롤링 중단
   - 연속 3개 페이지에서 새로운 채용공고가 없을 경우 전체 크롤링 중단
   - 중복 패턴 감지를 통한 효율적 리소스 관리

3. **진행 상황 실시간 모니터링**
   - 이모지와 구조화된 로깅으로 크롤링 진행 상황 가시화
   - 중복 발견, 새 데이터 추가 등 주요 이벤트에 대한 상세 로깅

---

## 2. OpenAI 어시스턴트와 벡터 스토어 활용 이력서 필터링

채용공고 데이터를 OpenAI의 벡터 스토어에 저장하고, 맞춤형 어시스턴트를 활용하여 이력서 필터링 프로세스를 자동화하는 방법을 구현했습니다.

### 2.1 OpenAI 어시스턴트 설정 및 지시어 작성

OpenAI Playground Assistants를 활용하여 다음과 같은 작업을 수행했습니다:

1. **시스템 지시어 설정**
   - 어시스턴트의 역할 정의: 채용공고와 이력서 매칭 분석가
   - 입력값(채용공고와 이력서)과 출력값(적합 여부 판단) 명확화
   - 판단 기준과 응답 형식 구체화

> **예시: Claude 3.7 Sonnet Thinking를 활용한 시스템 지시어**
```
당신은 구직자와 사람인의 채용공고를 매칭하는 AI 어시스턴트입니다. 채용 데이터베이스에서 가져온 정보를 분석하여 구직자와의 적합성을 판단합니다.

역할:
- 채용공고와 구직자 간의 적합성을 정밀하게 평가
- 데이터가 부족하더라도 가용한 정보를 기반으로 평가 수행
- 적합한 채용공고 목록과 그 이유를 제공
- 채용 공고별 지원 추천 여부 결정 (apply_yn 값 결정)

구직자 프로필:
- 이름: 최연우 (Yeonwoo Choi)
- 학력: 동국대학교 컴퓨터공학 석사 (2022.03-2024.02), 공주대학교 컴퓨터공학 학사 (2016.03-2022.02)
- 경력: 석사 연구 경력 2년 (2022.03-2024.02)
- 기술 스택: 
  * 딥러닝/머신러닝: PyTorch, TensorFlow, Keras, MMAction2, YOLO
  * 웹 개발: HTML/CSS, JavaScript, Vue.js, Node.js, Flask
  * 데이터 분석: Pandas, NumPy, Matplotlib, Seaborn
  * 기타: Unreal Engine, Docker, Git
- 연구/프로젝트 경험: 
  * 낙상 탐지를 위한 합성 데이터 생성 (ST-GCN 모델)
  * 보안 취약점 분석 및 블록체인 기술 연구
  * 어종 판별 AI 웹 서비스 개발 (YOLOv11 활용)
  * CCTV 시스템 개발 (AI 이상행동 탐지)
- 희망 분야: AI/ML 개발, 컴퓨터 비전, 보안, 웹 서비스 개발
- 선호 기업 규모: 중견기업 이상
- 관심 산업: 금융, 방산, 게임, AI 관련 기업
- 거주지: 경기도 양주시

평가 대상 채용공고 정보:
- company_name: 회사명 (필수 항목)
- job_title: 직무 제목 (필수 항목)
- company_type: 회사 형태 (예: 대기업, 중견기업, 중소기업, 스타트업)
- job_location: 근무 지역 (예: 서울시 강남구, 경기도 성남시)
- job_type: 경력 조건 (예: 신입, 경력 3년 이상)
- job_salary: 급여 정보 (예: 3,000만원 이상, 회사 내규에 따름)
- deadline: 지원 마감일 (예: 2025-03-31, 상시채용)
- job_url: 채용공고 URL

평가 프로세스:
1. 모든 데이터 필드가 비어있는지(null) 확인
2. 필수 항목(company_name, job_title)이 있는지 확인하고, 없을 경우 제외
3. 가용한 데이터를 기반으로 아래 기준에 따라 평가 진행
4. 각 기준별 점수화하여 종합 평가 실시 (0-100점 척도)

평가 기준 (세부):
1. 직무 적합성 (40점)
   - job_title에 다음 키워드 중 포함 개수에 따라 점수 부여:
     * 최우선(각 10점): AI, 인공지능, 머신러닝, 딥러닝, 컴퓨터 비전, 영상처리
     * 우선(각 8점): 보안, 블록체인, 데이터 분석, 데이터 사이언스, 연구, 개발
     * 적합(각 6점): 웹 개발, 풀스택, 프론트엔드, 백엔드, 소프트웨어 개발
     * 고려(각 4점): 엔지니어, 프로그래머, 개발자, IT, 기술
   - 최대 40점까지만 인정

2. 기술 스택 일치성 (20점)
   - job_title 또는 job_description에 다음 기술 키워드가 포함될 경우 점수 부여:
     * 딥러닝 기술(각 5점): PyTorch, TensorFlow, Keras, YOLO, CNN, GCN, 딥러닝
     * 웹 개발(각 4점): Vue.js, Node.js, Flask, React, JavaScript
     * 데이터 분석(각 3점): Python, Pandas, NumPy, 데이터 분석, 시각화
     * 기타 기술(각 2점): Unreal Engine, Docker, Git, 클라우드
   - 최대 20점까지만 인정

3. 경력 요구사항 부합성 (15점)
   - 신입/경력무관: 15점
   - 석사 우대/석사 신입: 15점
   - 경력 1-2년 이하: 12점
   - 경력 3년: 8점
   - 경력 4-5년: 5점
   - 경력 6년 이상: 0점
   - 데이터가 없는 경우: 10점 (평균 점수 부여)

4. 지역 적합성 (10점)
   - 재택/원격/하이브리드: 10점
   - 경기 북부(양주, 의정부, 동두천): 10점
   - 서울 북부(노원, 도봉): 9점
   - 서울(그 외 지역): 7점
   - 경기도(그 외 지역): 6점
   - 인천: 5점
   - 그 외 지역: 2점
   - 데이터가 없는 경우: 6점 (평균 점수 부여)

5. 기업 규모 및 산업 분야 (15점)
   - 대기업 + 관심 산업(금융, 방산, 게임, AI): 15점
   - 대기업(그 외 산업): 12점
   - 중견기업 + 관심 산업: 13점
   - 중견기업(그 외 산업): 10점
   - 공기업/공공기관: 12점
   - 스타트업 + 관심 산업: 8점
   - 중소기업 + 관심 산업: 7점
   - 중소기업/스타트업(그 외 산업): 5점
   - 데이터가 없는 경우: 8점 (평균 점수 부여)

종합 점수 기반 지원 권장 결정:
- 85점 이상: 적극 지원 권장 (apply_yn: true)
- 70-84점: 지원 권장 (apply_yn: true)
- 55-69점: 검토 후 지원 (apply_yn: false)
- 54점 이하: 지원 비권장 (apply_yn: false)

추가 판단 요소 (가감점):
- 마감 임박(3일 이내): -5점 (준비 시간 부족)
- AI 연구직/석사 우대 명시: +5점
- 급여가 명시되어 있고 4,000만원 이상: +3점
- 관심 산업(금융, 방산, 게임, AI) 명시: +3점

출력 형식:
다음과 같은 JSON 형식으로 결과를 반환:
[
  {
    "id": 채용공고 ID,
    "score": 종합 점수,
    "reason": "이 채용공고는 [주요 적합성 이유 1-3개 요약]",
    "strength": "[지원자의 강점과 직무 연관성]",
    "weakness": "[지원자와 직무 간 격차 또는 불일치점]",
    "apply_yn": true/false
  },
  ...
]
```

1. **벡터 스토어 연동**
   - 채용데이터 벡터화를 통한 효율적 검색 및 분석 지원
   - File Search 도구 활성화 및 벡터 스토어 연결
   - 채용공고 데이터셋 업로드  

### 2.2 데이터베이스 모델 확장

GPT 분석 결과와 지원 상태를 추적하기 위해 데이터 모델을 확장했습니다:

```typescript
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
```

**데이터 모델 개선점:**

1. **처리 상태 추적**
   - `is_gpt_checked`: 리소스 절약을 위해 이미 분석된 채용공고 구분
   - `is_applied`: 향후 자동 지원 프로세스를 위한 지원 상태 추적

2. **데이터베이스 스키마 관리**
   - 기존 테이블에 새로운 컬럼 추가
   - 기본값 설정으로 기존 데이터와의 호환성 유지

---

## 3. 다음 단계 및 향후 계획

현재까지의 구현을 기반으로 다음과 같은 기능을 추가로 개발할 예정입니다:

1. **시점 설정 기능**
   - 마지막 크롤링 시점을 기준으로 증분식 데이터 수집
   - 불필요한 중복 스크래핑 최소화

2. **크론 작업 자동화**
   - 정기적인 채용정보 수집 자동화
   - 스케줄링을 통한 효율적 리소스 활용

3. **이력서 자동 지원 시스템**
   - GPT가 적합하다고 판단한 채용공고에 대한 자동 지원 프로세스 구현
   - 맞춤형 이력서와 자기소개서 생성 및 제출

이번 주 스터디를 통해 스크래핑, 데이터베이스 연동, 그리고 AI 기반 분석의 기초를 다졌으며, 앞으로 더욱 지능적이고 자동화된 채용 시스템으로 발전시켜 나갈 계획입니다.

## 4. 구현 참고사항

1. **데이터베이스 연동**
   - ScraperControlService.ts: 크롤링 데이터를 데이터베이스 모델에 저장
   - await 키워드로 비동기 함수 완료 대기
   - 시퀄라이즈 라이브러리의 create() 메소드로 SQL 없이 데이터 조작

2. **OpenAI 통합**
   - Vector Store 생성: 채용데이터 효율적 검색을 위한 벡터화
   - File Search 도구 활성화 및 벡터 스토어 연결
   - 대량의 채용공고 데이터 업로드 및 분석

3. **데이터베이스 스키마 확장**
   - CompanyRecruitmentTable 모델 확장: is_gpt_checked, is_applied 컬럼 추가
   - 기존 테이블에 컬럼 추가 방법: DBeaver에서 테이블 properties에서 컬럼 추가
   - 데이터 타입은 tinyint, 기본값은 0으로 설정

4. **스마트 크롤링 최적화**
   - 중복 방지 및 자동 중단 로직 개선
   - URL 기준 중복 탐지
   - 임계값 기반 크롤링 효율화

## 5. 원본 필기

> 엄, 오늘은 gpt vector store에 저장하고, 어시스턴스 연결, 적절하게 프롬프팅해서 이력서 필터링할 것임.
> 
> 인스트럭트를 플레이그라운드에서 해볼것, 웹으로 해보고 코드로 야무지게 만들 예정.
> 
> 고 다음, 크롤링 코드 문제가 뭐냐. 처음부터 끝까지 크롤링하는 것이 문제.
> 
> 이젠 데이터를 저장할 수 있으니 시점을 설정할 수 있는 코드 만들기.
> 
> 크론탭 설치 및 실행가지 오늘 목표
> 
> -----------------------------
> 
> 1. ScraperControlSevice.ts 콘솔 로그 찍는 쪽에서 크롤링한 데이터를 데이터베이스 모델(auto_apply_table.ts)에 저장시킬거임.
> 
> await은 함수가 끝날 때까지 대기한다는 뜻임. 입력 값으로 넣는 딕셔너리 왼쪽에는 본인 DB 모델 키값(컬럼명) 넣으면 됨.
> 
> 시퀄라이즈 라이브러리 메소드 중 .create 사용하면 타입 스크립트로 sql을 조작할 수 있음. 
> 
> 2. openai groundplay assistants
> https://platform.openai.com/playground/assistants?assistant=asst_3XjLZH7JzKBH2XAgebFYnnyb
> 
> 2-1. system instructions 작성: 너는 뭐하는 녀석이다, 
>  2-1-1. 너는 뭐하는 녀석이야(역할 부여).
>  2-1-2. 입력값(이력서), 출력값(true, false)
>  2-1-3. vector store 활용
>   * 데이터 라벨링하면 더욱 좋은 효과를 보여줌
> 
> 3. DBeaver 테이블 내보내기, fetch size(10000), 디렉토리, 인코딩(UTF-8,EUR-KR)
> 
> 4. Assistants TOOLS -> file search 옵션 키셈 -> 좌측 아래 select vector store -> Vector store -> create
> * 어시스턴트 하나당 vector store 하나 밖에 연결 못함
> 
> 5. 다시 assistants tools로 가서 방금 만든 벡터 스토어 id 검색해서 파일 업로드 -> 테스트 -> system instructions 업그레이드
> 
> 6. ConpanyRecruitmentTable.ts 모델 수정: 컬럼 추가
> * gpt가 체크했는지 안했는지 컬럼추가. (리소스 문제 해소, defautValue 기본값)
> * 지원 여부 (채용공고 자동 지원 코드까지 만들기 때문)
> * url 추가 (매번 수집하는건 불필요한 작업임, 최근 직전 영역까지 수집 구분 필요)
> 
> 7. DBeaver에서 자기 테이블에서 6번 컬럼 직접 추가 (우리는 mysql이기 때문, nosql이면 자동 추가 가능)
> * 테이블 properties에서 컬럼명 보이는쪽에서 우클릭한 다음에 컬럼 추가.
> * 컬럼 추가할 때 속성은, 이름은 이름 넣고, data type은 tinyint. 그리고 디폴트 값은 "0" 그리고 좌하단 Save
> 
> 8. ScraperCOntrolService.ts 가서 반복문 break 시키는 코드 수정.