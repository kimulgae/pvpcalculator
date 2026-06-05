// 옵션 데이터를 저장할 객체
const parsedData = {
    my: { stats: {} },
    enemy: { stats: {} }
};

// --- [핵심 추가] 옵션 이름 오타 교정 및 중복 방지기 ---
function normalizeStatName(rawName) {
    const str = rawName.replace(/\s+/g, ''); // 공백을 모두 지우고 판별

    if (str.includes("치명타확")) return "치명타 확률";
    if (str.includes("치명타피") || str.includes("치명타애") || str.includes("치명타찌")) return "치명타 피해";
    if (str.includes("블록")) return "블록 확률";
    if (str.includes("재생")) return "체력 재생";
    if (str.includes("흡수")) return "생명력 흡수";
    if (str.includes("더블")) return "더블 찬스";
    if (str.includes("근접")) return "근접 피해";
    if (str.includes("원거리")) return "원거리 피해";
    if (str.includes("속도")) return "공격 속도";
    if (str.includes("대기시간")) return "스킬 재사용 대기시간";
    if (str.includes("스킬피") || str.includes("스킬애") || str.includes("스킬찌") || str.includes("스킬씨")) return "스킬 피해";
    
    // 위 조건들에 걸리지 않고 피/애/해/찌/씨 가 있다면 단일 '피해' 옵션으로 강력 통일
    if (str.includes("피해") || str.includes("피애") || str.includes("씨애") || str.includes("찌애") || str.includes("파해")) {
        return "피해";
    }

    return rawName.trim(); // 사전에 없는 값이면 원본 그대로 출력
}

// --- [1] 세부 옵션 전용 초고속 스캐너 ---
async function processImages(fileInputId, statusId, listId, playerKey) {
    const files = document.getElementById(fileInputId).files;
    if (files.length === 0) return;

    const statusEl = document.getElementById(statusId);
    statusEl.innerText = `⏳ 총 ${files.length}장의 이미지 스캔 중...`;
    statusEl.style.color = "#f9a826";

    parsedData[playerKey].stats = {}; // 기존 스캔 데이터 초기화

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

            const lines = text.split('\n');
            lines.forEach(line => {
                const optMatch = line.match(/(?:\+|-)?\s*([\d\.,]+)\s*%\s*([가-힣a-zA-Z\s]+)/);
                if (optMatch) {
                    const value = parseFloat(optMatch[1].replace(/,/g, '.'));
                    const rawName = optMatch[2].trim();
                    
                    // 1. 오타 교정기로 이름 깔끔하게 통일
                    const cleanName = normalizeStatName(rawName);
                    
                    // 2. 객체에 저장 (이름이 똑같으면 자동으로 덮어씌워지므로 중복 리스트업 절대 불가)
                    parsedData[playerKey].stats[cleanName] = value; 
                }
            });
        }

        // UI 리스트 그리기
        renderOptionList(parsedData[playerKey].stats, listId);

        statusEl.innerText = `✅ 세부 옵션 스캔 완료!`;
        statusEl.style.color = "#4ade80";

    } catch (error) {
        console.error(error);
        statusEl.innerText = `❌ 에러 발생: 이미지를 인식할 수 없습니다.`;
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

    // 객체에 담긴 데이터만 출력하므로 중복 데이터 없음 보장
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

document.getElementById('myImage').addEventListener('change', () => processImages('myImage', 'myStatus', 'myOptionList', 'my'));
document.getElementById('enemyImage').addEventListener('change', () => processImages('enemyImage', 'enemyStatus', 'enemyOptionList', 'enemy'));


// --- [2] 정밀 승률 예측 엔진 ---
document.getElementById('calcBtn').addEventListener('click', () => {
    
    // 단위 변환기
    const getMultiplier = (unit) => {
        switch(unit) {
            case 'k': return 1e3;          
            case 'm': return 1e6;          
            case 'b': return 1e9;          
            case 't': return 1e12;         
            case 'q': return 1e15;         
            default: return 1;             
        }
    };

    const getManualInput = (idVal, idUnit) => {
        const val = parseFloat(document.getElementById(idVal).value) || 0;
        const unit = document.getElementById(idUnit).value;
        return val * getMultiplier(unit);
    };

    const myDmg = getManualInput('myDmgVal', 'myDmgUnit');
    const myHp = getManualInput('myHpVal', 'myHpUnit');
    const enemyDmg = getManualInput('enemyDmgVal', 'enemyDmgUnit');
    const enemyHp = getManualInput('enemyHpVal', 'enemyHpUnit');

    if (myDmg === 0 || myHp === 0 || enemyDmg === 0 || enemyHp === 0) {
        alert("양쪽의 '총 피해'와 '총 체력'을 모두 숫자로 입력해주세요!");
        return;
    }

    const myBase = myDmg * myHp;
    const enemyBase = enemyDmg * enemyHp;

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
        feedback = `🏆 예상 결과: <b>승리</b><br>보유하신 전투력과 세부 옵션 시너지가 상대방을 압도합니다.`;
    } else if (winRate > 40) {
        feedback = `⚔️ 예상 결과: <b>박빙의 승부</b><br>전투력과 옵션 효율이 거의 비슷합니다. 전투 운에 따라 결과가 달라질 수 있습니다.`;
    } else {
        feedback = `⚠️ 예상 결과: <b>패배 위험</b><br>상대방의 세팅이 더 강력합니다. 스펙업이 필요합니다.`;
    }
    document.getElementById('feedbackText').innerHTML = feedback;
});
