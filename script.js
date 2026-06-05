// 옵션 데이터를 저장할 객체
const parsedData = {
    my: { stats: {} },
    enemy: { stats: {} }
};

// --- [무적의 오타 교정기 유지] ---
function normalizeStatName(rawName) {
    const str = rawName.replace(/\s+/g, '').toUpperCase(); 

    if (str.includes("확률") || str.includes("확럴") || str.includes("확룰")) {
        if (str.includes("블록") || str.includes("블럭")) return "블록 확률";
        return "치명타 확률"; 
    }
    
    if (str.includes("재생")) return "체력 재생";
    if (str.includes("흡수") || str.includes("흡슈")) return "생명력 흡수";
    if (str.includes("더블") || str.includes("떠블")) return "더블 찬스";
    if (str.includes("속도") || str.includes("속토")) return "공격 속도";
    if (str.includes("대기") || str.includes("재사용")) return "스킬 재사용 대기시간";
    
    const hasDmg = str.includes("피해") || str.includes("피애") || str.includes("씨애") || str.includes("찌애") || str.includes("파해") || str.includes("피헤");
    
    if (hasDmg) {
        if (str.includes("근접") || str.includes("건접")) return "근접 피해";
        if (str.includes("원거리") || str.includes("원거")) return "원거리 피해";
        if (str.includes("스킬") || str.includes("스길")) return "스킬 피해";
        
        if (str.length >= 4) return "치명타 피해"; 
        return "피해";
    }
    
    if (str.includes("치명") || str.includes("지명") || str.includes("명타")) return "치명타 피해"; 

    return null; 
}

// --- [세부 옵션 자동 스캐너] ---
async function processImages(fileInputId, statusId, listId, playerKey) {
    const files = document.getElementById(fileInputId).files;
    if (files.length === 0) return;

    const statusEl = document.getElementById(statusId);
    statusEl.innerText = `⏳ 총 ${files.length}장의 이미지 스캔 중...`;
    statusEl.style.color = "#f9a826";

    parsedData[playerKey].stats = {}; 

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
                    const cleanName = normalizeStatName(rawName);
                    
                    if (cleanName !== null) {
                        parsedData[playerKey].stats[cleanName] = value; 
                    }
                }
            });
        }

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


// --- [정밀 승률 예측 엔진 (스킨 & 스킬 시너지 포함)] ---
document.getElementById('calcBtn').addEventListener('click', () => {
    
    // 1. K, M, B, T, Q 단위 변환기
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

    // 2. 스킨/스킬 시너지가 적용된 계산 로직
    const calculateEfficiency = (statsObj, skinMultiplier, skillBaseBonus) => {
        let multi = 1.0;
        const dmg = getStat(statsObj, "피해");
        const as = getStat(statsObj, "공격 속도");
        const cr = getStat(statsObj, "치명타 확률");
        const cd = getStat(statsObj, "치명타 피해");
        const dc = getStat(statsObj, "더블 찬스");
        const skDmg = getStat(statsObj, "스킬 피해");
        const skCd = getStat(statsObj, "대기시간"); 
        
        // 기본 스탯 배율
        multi *= (1 + dmg);
        multi *= (1 + as);
        multi *= (1 + dc);
        multi *= (1 + (cr * (0.2 + cd)));
        
        // 스킨(Windup 모션) 배율 직접 곱연산 (S+ 티어일수록 강력함)
        multi *= skinMultiplier;

        // 스킬 장착 시너지 계산 (스킬을 장착해야 쿨감/스킬피해 스탯이 제 역할을 함)
        if (skillBaseBonus > 1.0) {
            // 장착한 스킬의 기본 위력 + 스킬피해 증폭 + 쿨감 증폭
            multi *= (skillBaseBonus + (skDmg * 1.5) + (Math.abs(skCd) * 2.0));
        } else {
            // 스킬 장착 안 했으면 기본 효율만 미미하게 적용
            multi *= (1 + skDmg);
            multi *= (1 + Math.abs(skCd));
        }

        return multi;
    };

    // UI에서 스킨, 스킬 값 가져오기
    const mySkin = parseFloat(document.getElementById('mySkin').value);
    const mySkill = parseFloat(document.getElementById('mySkill').value);
    const enemySkin = parseFloat(document.getElementById('enemySkin').value);
    const enemySkill = parseFloat(document.getElementById('enemySkill').value);

    const myEfficiency = calculateEfficiency(parsedData.my.stats, mySkin, mySkill);
    const enemyEfficiency = calculateEfficiency(parsedData.enemy.stats, enemySkin, enemySkill);

    // 3. 최종 승률 산출
    const myFinalScore = myBase * myEfficiency;
    const enemyFinalScore = enemyBase * enemyEfficiency;

    let winRate = (myFinalScore / (myFinalScore + enemyFinalScore)) * 100;
    winRate = Math.max(1, Math.min(99.9, winRate));

    const winRateFixed = winRate.toFixed(1);
    document.getElementById('resultText').innerText = `내 승리 확률: ${winRateFixed} %`;
    document.getElementById('winRateFill').style.width = `${winRateFixed}%`;

    let feedback = "";
    if (winRate > 60) {
        feedback = `🏆 예상 결과: <b>승리</b><br>보유하신 전투력, 스킨, 옵션 시너지가 상대방을 압도합니다.`;
    } else if (winRate > 40) {
        feedback = `⚔️ 예상 결과: <b>박빙의 승부</b><br>효율이 비슷합니다. 어떤 스킨/스킬을 장착했느냐가 승패를 가릅니다.`;
    } else {
        feedback = `⚠️ 예상 결과: <b>패배 위험</b><br>상대방의 세팅이 더 강력합니다. 모션이 빠른 스킨이나 좋은 스킬로 교체해보세요.`;
    }
    document.getElementById('feedbackText').innerHTML = feedback;
});
