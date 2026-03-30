# Battle Arena

장비-스킬 BT(Behavior Tree) 기반 오토배틀 게임

## 게임 소개

캐릭터를 제작하고, 장비를 장착하고, 스킬을 선택하여 자동 전투를 벌이는 오토배틀 게임입니다.

### 핵심 기능
- **5개 병과**: 전사, 마법사, 도적, 기사, 궁수 (각각 고유 패시브)
- **장비 시스템**: 투구/갑옷/무기/신발 — 골드 예산(1000G) 내에서 조합
- **스킬 선택**: 장비에서 얻는 4개 스킬 중 3개 선택
- **스탯 배분**: 공격/방어/지능/속도에 10포인트 분배
- **BT 기반 AI**: Behavior Tree로 캐릭터가 자동 판단 (생존/스킬/공격 가중치)
- **솔로 모드**: AI 3명과 즉시 대전
- **멀티플레이**: 방 생성/참가 후 실시간 대전

## 기술 스택

- **서버**: Node.js + Express + Socket.IO
- **클라이언트**: Vanilla HTML/CSS/JS (Canvas 2D)
- **AI**: Behavior Tree (shared/BehaviorTree.js)

## 프로젝트 구조

```
battle-arena/
├── server/
│   ├── index.js            # Express + Socket.IO 서버
│   ├── BattleEngine.js     # 전투 엔진 (BT 실행, 이벤트 수집)
│   └── Reward.js           # 순위별 보상 계산
├── client/
│   └── index.html          # UI 전체 (로비/제작소/전투/결과)
├── shared/
│   ├── BehaviorTree.js     # BT 노드 구현
│   └── CharacterBuilder.js # AI 캐릭터 빌드 생성
├── data/
│   ├── classes.json        # 병과 데이터
│   └── equipments.json     # 장비 데이터
├── img/                    # 레퍼런스 이미지
└── test-battle.js          # 전투 테스트
```

## 실행 방법

```bash
npm install
node server/index.js
# http://localhost:3456 접속
```

## 개발 히스토리

### v1.0 — Initial (dc274bb)
- 오토배틀 코어 시스템 완성
- 로비/제작소/전투/결과 화면
- 솔로(vs AI) + 멀티플레이 지원

### v1.1 — 반응형 UI + 보안 (271e5dd)
- 상단 짤림 수정 (overflow-x hidden, min-height 100vh)
- 모바일/PC 반응형 (미디어쿼리 600px/900px)
- 터치 UX (최소 44px 터치 타겟)
- XSS 방지 (esc() 헬퍼, 사용자 입력 이스케이프)

### v1.2 — 전투 뷰 대규모 개선 (29f018e)
- **쿼터뷰 전장**: 다이아몬드 형태 이소메트릭 바닥 + 그리드
- **기하학 캐릭터**: 병과별 색상/아이콘/무기/그림자 표현
- **좌표 변환**: 서버 1D x좌표 → 클라이언트 쿼터뷰 2D (synthetic Y)
- **데미지 숫자**: 피격 시 팝업 (일반: 흰색, 스킬: 노란색)
- **스킬 이펙트**: AoE 원형, 투사체, 버프 글로우 애니메이션
- **사망 연출**: 축소 + 파티클 버스트
- **서버 이벤트 로그**: battleTick에 events[] 추가 (damage/skill/death)
- **보안 강화**: onclick → data-attribute 패턴, rAF 라이프사이클 관리

## 향후 계획

- [ ] AI 생성 스프라이트로 캐릭터 교체 (레퍼런스: img/ 폴더)
- [ ] 버프/디버프 아이콘 표시
- [ ] 스킬 쿨다운 UI
- [ ] 사운드 이펙트
- [ ] 서버 빌드 검증 (스탯/스킬 유효성)
