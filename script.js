let isMyDataReady = false;
let isEnemyDataReady = false;

// 파싱된 데이터를 저장할 메인 객체 (전투력 대신 dmg와 hp로 명확히 분리)
const parsedData = {
    my: { dmg: 0, hp: 0, stats: {} },
    enemy: { dmg: 0, hp: 0, stats: {} }
};

// --- [1] 다중 이미지 자동 분석 모듈 ---
async function processImages(fileInputId, statusId, listId, playerKey) {
    const files = document.getElementById(fileInputId).files;
    if (files.length === 0) return;

    const statusEl = document.getElementById(statusId);
    statusEl.innerText = `⏳ 총 ${files.length}장의 이미지 스캔 중...`;
    statusEl.style.color = "#f9a826";

    // 데이터 초기화 (다시 올릴 경우를 대비)
    parsedData[playerKey].stats = {};
    let maxDmg = 0;
    let maxHp = 0;

    try {
        // 여러 장의 이미지를 순회하며 스캔
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const imageUrl = URL.createObjectURL(file);

            const { data: { text } } = await Tesseract.recognize(imageUrl, 'kor+eng', {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        statusEl.innerText = `🔍 [${i + 1}/${files.length}] 이미지 분석 중... ${Math.round(m.progress * 100)}%`;
                    }
                }
            });
            
            // 1. 기본 스탯 추출 (띄어쓰기 오류 방지를 위해 모든 공백 제거 후 탐색)
            const noSpaceText = text.replace(/\s+/g, '').replace(/,/g, '');
            
            // 총피해 (1.29b총피해 또는 총피해1.29b 모두 인식)
            let m1 = noSpaceText.match(/([\d\.]+)([mbMB])총피해/i);
            let m2 = noSpaceText.match(/총피해([\d\.]+)([mbMB])/i);
            let dmgVal = 0;
            if (m1) { dmgVal = parseFloat(m1[1]); if(m1[2].toLowerCase() === 'm') dmgVal /= 1000; }
            else if (m2) { dmgVal = parseFloat(m2[1]); if(m2[2].toLowerCase() === 'm') dmgVal /= 1000; }
            if (dmgVal > maxDmg) maxDmg = dmgVal;

            // 총체력
            let m3 = noSpaceText.match(/([\d\.]+)([mbMB])총체력/i);
            let m4 = noSpaceText.match(/총체력([\d\.]+)([mbMB])/i);
            let hpVal = 0;
            if (m3) { hpVal = parseFloat(m3[1]); if(m3[2].toLowerCase() === 'm') hpVal /= 1000; }
            else if (m4) { hpVal = parseFloat(m4[1]); if(m4[2].toLowerCase() === 'm') hpVal /= 1000; }
            if (hpVal > maxHp) maxHp = hpVal;

            // 2. 세부 옵션 추출 (띄어쓰기 포함 원본 텍스트 사용)
            const lines = text.split('\n');
            lines.forEach(line => {
                const match = line.match(/(?:\+|-)?\s*([\d\.]+)\s*%\s*([가-힣a-zA-Z\s]+)/);
                if (match) {
                    const value = parseFloat(match[1]);
                    const name = match[2].trim();
                    // 여러 장에서 중복 인식되더라도 덮어쓰므로 문제없음
                    parsedData[playerKey].stats[name] = value; 
                }
            });
        } // for loop 종료

        // 찾지 못했을 경우 기본값 1 부여 (계산 오류 방지)
        parsedData[playerKey].dmg = maxDmg || 1;
        parsedData[playerKey].hp = maxHp || 1;

        // UI 업데이트
        renderOptionList(parsedData[playerKey].stats, listId);

        const displayDmg = parsedData[playerKey].dmg === 1 ? "?" : parsedData[playerKey].dmg.toFixed(3);
        const displayHp = parsedData[playerKey].hp === 1 ? "?" : parsedData[playerKey].hp.toFixed(2);

        statusEl.innerText = `✅ 스캔 완료! (총 피해: ${displayDmg}B / 총 체력: ${displayHp}B)`;
        statusEl.style.color = "#4ade80";

        if (playerKey === 'my') isMyDataReady = true;
        if (playerKey === 'enemy') isEnemyDataReady = true;
        checkReadyState();

    } catch (error) {
        console.error(error);
        statusEl.innerText = `❌ 에러 발생: 텍스트를 인식할 수 없습니다.`;
        statusEl.style.color = "#ff4b4b";
    }
}

// 추출한 옵션을 심플한 목록으로 그려주는 함수
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

function checkReadyState() {
    const btn = document.getElementById('calcBtn');
    if (isMyDataReady && isEnemyDataReady) {
        btn.disabled = false;
        btn.innerText = "승률 시뮬레이션 시작";
        btn.style.background = "linear-gradient(135deg, #4ade80, #059669)";
    }
}

// 이벤트 리스너 (processImages로 변경)
document.getElementById('myImage').addEventListener('change', () => processImages('myImage', 'myStatus', 'myOptionList', 'my'));
document.getElementById('enemyImage').addEventListener('change', () => processImages('enemyImage', 'enemyStatus', 'enemyOptionList', 'enemy'));


// --- [2] 정밀 승률 예측 엔진 ---
document.getElementById('calcBtn').addEventListener('click', () => {
    // 기초 점수 = 총 피해 * 총 체력
    const myBase = parsedData.my.dmg * parsedData.my.hp;
    const enemyBase = parsedData.enemy.dmg * parsedData.enemy.hp;

    const getStat = (statsObj, keyword) => {
        const foundKey = Object.keys(statsObj).find(k => k.includes(keyword));
        return foundKey ? (statsObj[foundKey] / 100) : 0;
    };

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
        feedback = `⚠️ 예상 결과: <b>패배 위험</b><br>상대방의 세부 옵션 효율이 더 높습니다. 부족한 옵션을 보강하여 배율을 높여보세요.`;
    }
    document.getElementById('feedbackText').innerHTML = feedback;
});
