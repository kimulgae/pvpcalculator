// 옵션 데이터를 저장할 객체
const parsedData = {
    my: { stats: {} },
    enemy: { stats: {} }
};

// --- [1] 세부 옵션 전용 초고속 스캐너 ---
async function processImages(fileInputId, statusId, listId, playerKey) {
    const files = document.getElementById(fileInputId).files;
    if (files.length === 0) return;

    const statusEl = document.getElementById(statusId);
    statusEl.innerText = `⏳ 총 ${files.length}장의 이미지 스캔 중...`;
    statusEl.style.color = "#f9a826";

    parsedData[playerKey].stats = {}; // 초기화

    try {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const imageUrl = URL.createObjectURL(file);

            const { data: { text } } = await Tesseract.recognize(imageUrl, 'kor+eng', {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        statusEl.innerText = `🔍 옵션 스캔 중... ${Math.round(m.progress * 100)}%`;
                    }
                }
            });

            // 1. 오직 세부 옵션만 정밀하게 긁어옵니다 (+ 수치 % 형태)
            const lines = text.split('\n');
            lines.forEach(line => {
                const optMatch = line.match(/(?:\+|-)?\s*([\d\.,]+)\s*%\s*([가-힣a-zA-Z\s]+)/);
                if (optMatch) {
                    const value = parseFloat(optMatch[1].replace(/,/g, '.'));
                    const name = optMatch[2].trim();
                    parsedData[playerKey].stats[name] = value; 
                }
            });
        }

        // UI 리스트 그리기
        renderOptionList(parsedData[playerKey].stats, listId);

        statusEl.innerText = `✅ 세부 옵션 스캔 완료!`;
        statusEl.style.color = "#4ade80";

    } catch (error) {
        console.error(error);
        statusEl.innerText = `❌ 에러 발생: 텍스트를 인식할 수 없습니다.`;
        statusEl.style.color = "#ff4b4b";
    }
}

function renderOptionList(stats, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = ""; 

    const keys = Object.keys(stats);
    if (keys.length === 0) {
        container.innerHTML = "<p style='color: #8e8e9f; font-size: 13px; margin-top: 10px;'>인식된 세부 옵션이 없습니다.</p>";
        return;
    }

    keys.forEach(optionName => {
        const value = stats[optionName];
        const prefix = optionName.includes("대기시간") ? "-" : "+";
        
        container.innerHTML += `
            <div class="simple-option-item">
                <span class="opt-name">${optionName}</span>
                <span class="opt-value">${prefix}${value}%</span>
            </div>
        `;
    });
}

// 이벤트 연결
document.getElementById('myImage').addEventListener('change', () => processImages('myImage', 'myStatus', 'myOptionList', 'my'));
document.getElementById('enemyImage').addEventListener('change', () => processImages('enemyImage', 'enemyStatus', 'enemyOptionList', 'enemy'));


// --- [2] 정밀 승률 예측 엔진 (수동 입력값 + 스캔값 결합) ---
document.getElementById('calcBtn').addEventListener('click', () => {
    
    // 수동 입력값 가져오기 로직 (M은 B단위로 환산하기 위해 1000으로 나눔)
    const getManualInput = (idVal, idUnit) => {
        const val = parseFloat(document.getElementById(idVal).value) || 0;
        const unit = document.getElementById(idUnit).value;
        return unit === 'm' ? val / 1000 : val;
    };

    const myDmg = getManualInput('myDmgVal', 'myDmgUnit');
    const myHp = getManualInput('myHpVal', 'myHpUnit');
    const enemyDmg = getManualInput('enemyDmgVal', 'enemyDmgUnit');
    const enemyHp = getManualInput('enemyHpVal', 'enemyHpUnit');

    // 필수값 검증
    if (myDmg === 0 || myHp === 0 || enemyDmg === 0 || enemyHp === 0) {
        alert("양쪽의 '총 피해'와 '총 체력'을 모두 숫자로 입력해주세요!");
        return;
    }

    // 기초 점수 (단위가 통일된 B값으로 계산)
    const myBase = myDmg * myHp;
    const enemyBase = enemyDmg * enemyHp;

    const getStat = (statsObj, keyword) => {
        const foundKey = Object.keys(statsObj).find(k => k.includes(keyword));
        return foundKey ? (statsObj[foundKey] / 100) : 0;
    };

    // 옵션 효율 시너지 계산
    const calculateEfficiency = (statsObj) => {
        let multi = 1.0;
        const dmg = getStat(statsObj, "피해");
        const as = getStat(statsObj, "공격 속도");
        const cr = getStat(statsObj, "치명타 확률");
        const cd = getStat(statsObj, "치명타 피해");
        const dc = getStat(statsObj, "더블 찬스");
        const skDmg = getStat(statsObj, "스킬 피해");
        const skCd = getStat(statsObj, "대기시간"); 
        
        multi *= (1 + dmg);
        multi *= (1 + as);
        multi *= (1 + dc);
        multi *= (1 + (cr * (0.2 + cd)));
        multi *= (1 + skDmg);
        multi *= (1 + Math.abs(skCd));    

        return multi;
    };

    const myEfficiency = calculateEfficiency(parsedData.my.stats);
    const enemyEfficiency = calculateEfficiency(parsedData.enemy.stats);

    const myFinalScore = myBase * myEfficiency;
    const enemyFinalScore = enemyBase * enemyEfficiency;

    let winRate = (myFinalScore / (myFinalScore + enemyFinalScore)) * 100;
    winRate = Math.max(1, Math.min(99.9, winRate));

    const winRateFixed = winRate.toFixed(1);
    document.getElementById('resultText').innerText = `내 승리 확률: ${winRateFixed} %`;
    document.getElementById('winRateFill').style.width = `${winRateFixed}%`;

    let feedback = "";
    if (winRate > 60) {
        feedback = `🏆 예상 결과: <b>승리</b><br>보유하신 세부 옵션 시너지(배율)가 상대방을 크게 압도합니다.`;
    } else if (winRate > 40) {
        feedback = `⚔️ 예상 결과: <b>박빙의 승부</b><br>전투력과 옵션 효율이 거의 비슷합니다. 치명타나 더블 타격의 운에 따라 결과가 달라질 수 있습니다.`;
    } else {
        feedback = `⚠️ 예상 결과: <b>패배 위험</b><br>상대방의 스탯 및 옵션 효율이 더 높습니다. 부족한 옵션을 보강하여 배율을 높여보세요.`;
    }
    document.getElementById('feedbackText').innerHTML = feedback;
});
