// 양쪽 데이터가 모두 준비되었는지 확인하는 플래그
let isMyDataReady = false;
let isEnemyDataReady = false;

// 파싱된 데이터를 저장할 메인 객체
const parsedData = {
    my: { power: 0, hp: 0, stats: {} },
    enemy: { power: 0, hp: 0, stats: {} }
};

// --- [1] 이미지 자동 분석 모듈 ---
async function processImage(fileInputId, statusId, listId, playerKey) {
    const file = document.getElementById(fileInputId).files[0];
    if (!file) return;

    const statusEl = document.getElementById(statusId);
    statusEl.innerText = "🔍 이미지 스캔 중... (잠시만 기다려주세요)";
    statusEl.style.color = "#f9a826";

    try {
        const { data: { text } } = await Tesseract.recognize(file, 'kor+eng');
        
        // 1. 기본 전투력(B) / 체력(B) 추출
        const cpMatch = text.match(/(?:전투력|대장간|기본).*?([\d\.]+)\s*[bB]/i) || text.match(/([\d\.]+)\s*[bB]/);
        const hpMatch = text.match(/(?:체력|총\s*체력).*?([\d\.]+)\s*[bB]/i);
        
        parsedData[playerKey].power = cpMatch ? parseFloat(cpMatch[1]) : 1;
        parsedData[playerKey].hp = hpMatch ? parseFloat(hpMatch[1]) : 1;

        // 2. 만능 옵션 스캐너 (텍스트 전체에서 옵션 수치만 긁어모음)
        const extractedStats = {};
        const lines = text.split('\n');
        
        lines.forEach(line => {
            // 정규식 설명: (+ 또는 - 기호 가능) (숫자.숫자) (%) (한글/영문 텍스트)
            const match = line.match(/(?:\+|-)?\s*([\d\.]+)\s*%\s*([가-힣a-zA-Z\s]+)/);
            if (match) {
                const value = parseFloat(match[1]);
                const name = match[2].trim(); // 예: "치명타 확률"
                // 쿨감 같이 마이너스가 붙을 수 있는 경우를 위해 숫자만 저장 (나중에 계산에서 절댓값 처리)
                extractedStats[name] = value;
            }
        });

        parsedData[playerKey].stats = extractedStats;

        // 3. UI 업데이트 (심플 리스트 생성)
        renderOptionList(extractedStats, listId);

        // 로딩 완료 처리
        statusEl.innerText = `✅ 스캔 완료! (기본 스탯: ${parsedData[playerKey].power}B / ${parsedData[playerKey].hp}B)`;
        statusEl.style.color = "#4ade80";

        // 양쪽 모두 준비되면 계산 버튼 활성화
        if (playerKey === 'my') isMyDataReady = true;
        if (playerKey === 'enemy') isEnemyDataReady = true;
        checkReadyState();

    } catch (error) {
        console.error(error);
        statusEl.innerText = "❌ 이미지 인식 실패. 글자가 선명한 사진을 올려주세요.";
        statusEl.style.color = "#ff4b4b";
    }
}

// 추출한 옵션을 심플한 목록으로 그려주는 함수
function renderOptionList(stats, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = ""; // 기존 내용 비우기

    const keys = Object.keys(stats);
    if (keys.length === 0) {
        container.innerHTML = "<p style='color: #8e8e9f; font-size: 13px; margin-top: 10px;'>인식된 세부 옵션이 없습니다.</p>";
        return;
    }

    keys.forEach(optionName => {
        const value = stats[optionName];
        // 스킬 쿨타임처럼 원래 마이너스인 옵션의 기호 처리
        const prefix = optionName.includes("대기시간") ? "-" : "+";
        
        const html = `
            <div class="simple-option-item">
                <span class="opt-name">${optionName}</span>
                <span class="opt-value">${prefix}${value}%</span>
            </div>
        `;
        container.innerHTML += html;
    });
}

function checkReadyState() {
    const btn = document.getElementById('calcBtn');
    if (isMyDataReady && isEnemyDataReady) {
        btn.disabled = false;
        btn.innerText = "승률 시뮬레이션 시작";
        btn.style.background = "linear-gradient(135deg, #4ade80, #059669)";
    }
}

// 업로드 이벤트 리스너 연결
document.getElementById('myImage').addEventListener('change', () => processImage('myImage', 'myStatus', 'myOptionList', 'my'));
document.getElementById('enemyImage').addEventListener('change', () => processImage('enemyImage', 'enemyStatus', 'enemyOptionList', 'enemy'));


// --- [2] 정밀 승률 예측 엔진 ---
document.getElementById('calcBtn').addEventListener('click', () => {
    // 1. 기초 체급
    const myBase = parsedData.my.power * parsedData.my.hp;
    const enemyBase = parsedData.enemy.power * parsedData.enemy.hp;

    // 2. 키워드를 유연하게 검색하여 수치를 반환하는 함수 (OCR 오타 대응)
    const getStat = (statsObj, keyword) => {
        const foundKey = Object.keys(statsObj).find(k => k.includes(keyword));
        return foundKey ? (statsObj[foundKey] / 100) : 0;
    };

    // 3. 복리(Multiplicative) 옵션 효율 계산
    const calculateEfficiency = (statsObj) => {
        let multi = 1.0;
        
        const dmg = getStat(statsObj, "피해");
        const as = getStat(statsObj, "공격 속도");
        const cr = getStat(statsObj, "치명타 확률");
        const cd = getStat(statsObj, "치명타 피해");
        const dc = getStat(statsObj, "더블 찬스");
        const skDmg = getStat(statsObj, "스킬 피해");
        const skCd = getStat(statsObj, "대기시간"); // 쿨타임 대기시간 감소
        
        multi *= (1 + dmg);
        multi *= (1 + as);
        multi *= (1 + dc);
        multi *= (1 + (cr * (0.2 + cd))); // 파이썬 시뮬레이터 로직
        multi *= (1 + skDmg);
        multi *= (1 + Math.abs(skCd));    // 쿨타임 감소는 효율 증가분으로 적용

        return multi;
    };

    const myEfficiency = calculateEfficiency(parsedData.my.stats);
    const enemyEfficiency = calculateEfficiency(parsedData.enemy.stats);

    // 4. 최종 스코어 기반 승률 도출
    const myFinalScore = myBase * myEfficiency;
    const enemyFinalScore = enemyBase * enemyEfficiency;

    let winRate = (myFinalScore / (myFinalScore + enemyFinalScore)) * 100;
    winRate = Math.max(1, Math.min(99.9, winRate));

    // 5. 결과 UI 반영
    const winRateFixed = winRate.toFixed(1);
    document.getElementById('resultText').innerText = `내 승리 확률: ${winRateFixed} %`;
    document.getElementById('winRateFill').style.width = `${winRateFixed}%`;

    let feedback = "";
    if (winRate > 60) {
        feedback = `🏆 예상 결과: <b>승리</b><br>보유하신 세부 옵션 시너지(배율)가 상대방을 크게 압도합니다.`;
    } else if (winRate > 40) {
        feedback = `⚔️ 예상 결과: <b>박빙의 승부</b><br>전투력과 옵션 효율이 거의 비슷합니다. 치명타나 더블 타격의 운에 따라 결과가 달라질 수 있습니다.`;
    } else {
        feedback = `⚠️ 예상 결과: <b>패배 위험</b><br>상대방의 세부 옵션 효율이 더 높습니다. 부족한 옵션을 보강하여 배율을 높여보세요.`;
    }
    document.getElementById('feedbackText').innerHTML = feedback;
});
