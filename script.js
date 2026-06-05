// 양쪽 데이터가 모두 준비되었는지 확인하는 플래그
let isMyDataReady = false;
let isEnemyDataReady = false;

// 파싱된 데이터를 저장할 메인 객체
const parsedData = {
    my: { power: 1, dmg: 0, hp: 0, stats: {} },
    enemy: { power: 1, dmg: 0, hp: 0, stats: {} }
};

// --- [1] 다중 이미지 자동 분석 모듈 ---
async function processImages(fileInputId, statusId, listId, playerKey) {
    const files = document.getElementById(fileInputId).files;
    if (files.length === 0) return;

    const statusEl = document.getElementById(statusId);
    statusEl.innerText = `⏳ 총 ${files.length}장의 이미지 스캔 중...`;
    statusEl.style.color = "#f9a826";

    parsedData[playerKey].stats = {};
    let maxDmg = 0;
    let maxHp = 0;
    let parsedPower = 1;

    try {
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

            // 1. 기본 전투력(CP) 추출 (최상단에 위치한 B 단위 숫자)
            // 전투력을 알아야 M인지 B인지 똑똑하게 유추할 수 있습니다.
            if (parsedPower === 1) {
                const cpMatch = text.match(/([\d\.,]+)\s*([mbMB])/);
                if (cpMatch) {
                    let pVal = parseFloat(cpMatch[1].replace(/,/g, '.'));
                    if (cpMatch[2].toLowerCase() === 'm') pVal /= 1000;
                    parsedPower = pVal;
                    parsedData[playerKey].power = parsedPower;
                }
            }

            // [핵심] M / B 자동 유추 헬퍼 함수
            const deduceUnit = (val, extractedUnit) => {
                let unit = extractedUnit.toLowerCase();
                if (unit.includes('m') || unit.includes('n') || unit.includes('w')) return 'm';
                if (unit.includes('b') || unit.includes('v') || unit.includes('d') || unit.includes('6')) return 'b';
                
                // OCR이 단위를 아예 빼먹었을 경우 수학적 추론!
                // 피해량/체력 숫자가 전투력의 2배보다 크다면? 그건 절대 B일 수 없으므로 무조건 M으로 판정!
                if (parsedPower > 1) {
                    return (val > parsedPower * 2) ? 'm' : 'b';
                } else {
                    return (val > 50) ? 'm' : 'b';
                }
            };

            const lines = text.split('\n');
            lines.forEach(line => {
                
                // 2. 총 피해 추출
                const dmgMatch = line.match(/([\d\.,]+)\s*([a-zA-Z가-힣6]*)\s*[총종통충층]\s*피\s*[해히]/i);
                if (dmgMatch) {
                    let numStr = dmgMatch[1].replace(/,/g, '.');
                    let unitStr = dmgMatch[2];

                    if (unitStr === '' && numStr.endsWith('6') && numStr.includes('.')) {
                        numStr = numStr.slice(0, -1);
                        unitStr = 'b';
                    }

                    let val = parseFloat(numStr);
                    let finalUnit = deduceUnit(val, unitStr);

                    if (finalUnit === 'm') val /= 1000;
                    if (val > maxDmg && val < 5000) maxDmg = val;
                }

                // 3. 총 체력 추출
                const hpMatch = line.match(/([\d\.,]+)\s*([a-zA-Z가-힣6]*)\s*[총종통충층]\s*[체채제]\s*[력럭릭]/i);
                if (hpMatch) {
                    let numStr = hpMatch[1].replace(/,/g, '.');
                    let unitStr = hpMatch[2];

                    if (unitStr === '' && numStr.endsWith('6') && numStr.includes('.')) {
                        numStr = numStr.slice(0, -1);
                        unitStr = 'b';
                    }

                    let val = parseFloat(numStr);
                    let finalUnit = deduceUnit(val, unitStr);

                    if (finalUnit === 'm') val /= 1000;
                    if (val > maxHp && val < 5000) maxHp = val;
                }

                // 4. 세부 옵션 추출 (+ 수치 % 형태)
                const optMatch = line.match(/(?:\+|-)?\s*([\d\.,]+)\s*%\s*([가-힣a-zA-Z\s]+)/);
                if (optMatch) {
                    const value = parseFloat(optMatch[1].replace(/,/g, '.'));
                    const name = optMatch[2].trim();
                    parsedData[playerKey].stats[name] = value; 
                }
            });
        }

        parsedData[playerKey].dmg = maxDmg || 1;
        parsedData[playerKey].hp = maxHp || 1;

        // UI 리스트 그리기
        renderOptionList(parsedData[playerKey].stats, listId);

        // 표시용 포맷팅
        const displayDmg = parsedData[playerKey].dmg === 1 ? "?" : parsedData[playerKey].dmg.toFixed(3);
        const displayHp = parsedData[playerKey].hp === 1 ? "?" : parsedData[playerKey].hp.toFixed(3);

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
