const parsedData = {
    my: { stats: {} },
    enemy: { stats: {} }
};

window.onload = () => {
    const skillHTML = `
        <option value="None" selected>스킬 없음</option>
        <option value="Meat">🍖 고기</option>
        <option value="Arrows">🏹 화살</option>
        <option value="Shout">🗣️ 외침</option>
        <option value="Berserk">😡 광전사</option>
        <option value="Cannon">💣 포격</option>
        <option value="Shuriken">🥷 수리검</option>
        <option value="Buff">💪 버프</option>
        <option value="ArrowRains">🌧️ 화살비</option>
        <option value="Thorns">🌵 가시</option>
        <option value="Bomb">💣 폭탄</option>
        <option value="Meteorite">☄️ 운석</option>
        <option value="Morale">⭐ 사기</option>
        <option value="Lightning">⚡ 번개</option>
        <option value="Stampede">🐗 쇄도</option>
        <option value="Worm">🐛 벌레</option>
        <option value="Drone">🚁 드론</option>
        <option value="HigherMorale">👼 높은사기</option>
        <option value="StrafeRun">🛩️ 기총소사</option>
    `;
    ['mySkill1', 'mySkill2', 'mySkill3', 'enemySkill1', 'enemySkill2', 'enemySkill3'].forEach(id => {
        document.getElementById(id).innerHTML = skillHTML;
    });
};

const SKILL_DB = {
    "Meat": { type: "buff", dmgBonus: 0, hpBonus: 0.0001, duration: 10, count: 7.5 },
    "Arrows": { type: "dmg", power: 0.0002, cooldown: 7, count: 8.57 },
    "Shout": { type: "dmg", power: 0.00015, cooldown: 6, count: 10 },
    "Berserk": { type: "buff", dmgBonus: 0.00128, hpBonus: 0, duration: 10, count: 7.5 },
    "Cannon": { type: "dmg", power: 0.00128, cooldown: 5, count: 12 },
    "Shuriken": { type: "dmg", power: 0.00128, cooldown: 4, count: 15 },
    "Buff": { type: "buff", dmgBonus: 0.01, hpBonus: 0.08, duration: 10, count: 7.5 },
    "ArrowRains": { type: "dmg", power: 0.18, cooldown: 10, count: 6 },
    "Thorns": { type: "dmg", power: 0.0615, cooldown: 5, count: 12 },
    "Bomb": { type: "dmg", power: 0.3, cooldown: 6, count: 10 },
    "Meteorite": { type: "dmg", power: 0.5, cooldown: 9, count: 6.67 },
    "Morale": { type: "buff", dmgBonus: 0.04, hpBonus: 0.32, duration: 10, count: 7.5 },
    "Lightning": { type: "dmg", power: 0.5, cooldown: 3, count: 20 },
    "Stampede": { type: "dmg", power: 1.0, cooldown: 20, count: 3 },
    "Worm": { type: "dmg", power: 1.0, cooldown: 8, count: 7.5 },
    "Drone": { type: "dmg", power: 8.0, cooldown: 8, count: 7.5 },
    "HigherMorale": { type: "buff", dmgBonus: 1.5, hpBonus: 12.0, duration: 8, count: 7.5 },
    "StrafeRun": { type: "dmg", power: 12.0, cooldown: 10, count: 6 }
};

const ASCENSION_MULTIPLIERS = {
    0: 1.0,
    1: 49.0,
    2: 2499.0,
    3: 124999.0
};

// [옵션 정규화 핵심: 체력 vs 체력 재생 완벽 분리]
function normalizeStatName(rawName) {
    const str = rawName.replace(/\s+/g, '').toUpperCase(); 
    
    if (str.includes("체력재생") || str.includes("체력생") || str === "재생") return "체력 재생";
    if (str === "체력" || str.includes("체력%")) return "체력"; 
    
    if (str.includes("확률") || str.includes("확럴") || str.includes("확룰")) return (str.includes("블록") || str.includes("블럭")) ? "블록 확률" : "치명타 확률"; 
    if (str.includes("흡수") || str.includes("흡슈")) return "생명력 흡수";
    if (str.includes("더블") || str.includes("떠블")) return "더블 찬스";
    if (str.includes("속도") || str.includes("속토")) return "공격 속도";
    if (str.includes("대기") || str.includes("재사용")) return "스킬 재사용 대기시간";
    
    const hasDmg = str.includes("피해") || str.includes("피애") || str.includes("씨애") || str.includes("찌애") || str.includes("파해");
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

// [다중 스캔 로직 보강: 여러 장을 올려도 안정적으로 누적]
async function processImages(fileInputId, statusId, listId, playerKey) {
    const files = document.getElementById(fileInputId).files;
    if (files.length === 0) return;

    const statusEl = document.getElementById(statusId);
    statusEl.innerText = `⏳ 총 ${files.length}장 분석 중...`;
    statusEl.style.color = "#f9a826";

    // 스캔 시작 시 기존 옵션 초기화 (새로운 사진 그룹만 적용)
    parsedData[playerKey].stats = {}; 

    try {
        for (let i = 0; i < files.length; i++) {
            statusEl.innerText = `⏳ ${i + 1}/${files.length}번째 이미지 처리 중...`;
            const { data: { text } } = await Tesseract.recognize(URL.createObjectURL(files[i]), 'kor+eng');

            text.split('\n').forEach(line => {
                const optMatch = line.match(/(?:\+|-)?\s*([\d\.,]+)\s*%\s*([가-힣a-zA-Z\s]+)/);
                if (optMatch) {
                    const cleanName = normalizeStatName(optMatch[2].trim());
                    if (cleanName !== null) {
                        parsedData[playerKey].stats[cleanName] = parseFloat(optMatch[1].replace(/,/g, '.')); 
                    }
                }
            });
        }
        
        renderOptionList(parsedData[playerKey].stats, listId);
        statusEl.innerText = `✅ 세부 옵션 스캔 완료!`;
        statusEl.style.color = "#4ade80";

    } catch (e) { 
        statusEl.innerText = `❌ 에러 발생`;
        statusEl.style.color = "#ff4b4b";
    }
}

function renderOptionList(stats, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = ""; 
    if(Object.keys(stats).length === 0) {
        container.innerHTML = "<p style='color: #8e8e9f; font-size: 13px; margin-top: 10px;'>인식된 옵션이 없습니다.</p>";
        return;
    }
    Object.keys(stats).forEach(name => {
        const prefix = name.includes("대기시간") ? "-" : "+";
        container.innerHTML += `<div class="simple-option-item"><span class="opt-name">${name}</span><span class="opt-value">${prefix}${stats[name]}%</span></div>`;
    });
}

// [정밀 계산 엔진: 체력, 근접 피해 등 인식된 모든 옵션 반영]
document.getElementById('calcBtn').addEventListener('click', () => {
    
    const getMultiplier = (u) => ({'k': 1e3, 'm': 1e6, 'b': 1e9, 't': 1e12, 'q': 1e15}[u] || 1);
    const getVal = (v, u) => parseFloat(document.getElementById(v).value || 0) * getMultiplier(document.getElementById(u).value);

    const myBase = getVal('myDmgVal', 'myDmgUnit') * getVal('myHpVal', 'myHpUnit');
    const enemyBase = getVal('enemyDmgVal', 'enemyDmgUnit') * getVal('enemyHpVal', 'enemyHpUnit');

    if (myBase === 0 || enemyBase === 0) {
        alert("양쪽의 '총 피해'와 '총 체력'을 모두 숫자로 입력해주세요!");
        return;
    }

    const calcEff = (stats, pKey) => {
        // 정확한 키 매칭 및 합산을 위해 includes 대신 === 활용 (안전성 강화)
        const getS = (k) => stats[Object.keys(stats).find(x => x === k)] / 100 || 0;
        
        let multi = 1.0;
        // 이제 "체력", "근접 피해" 등 스캔된 값도 최종 승률에 강력하게 반영됩니다.
        multi *= (1 + getS("피해") + getS("근접 피해") + getS("원거리 피해") + getS("스킬 피해"));
        multi *= (1 + getS("체력"));
        multi *= (1 + getS("공격 속도"));
        multi *= (1 + getS("더블 찬스"));
        multi *= (1 + (getS("치명타 확률") * (0.2 + getS("치명타 피해"))));

        const ascLevel = parseInt(document.getElementById(pKey + 'Ascension').value);
        const ascBonus = ASCENSION_MULTIPLIERS[ascLevel] || 1.0;

        for (let i = 1; i <= 3; i++) {
            const skillKey = document.getElementById(pKey + 'Skill' + i).value;
            const s = SKILL_DB[skillKey];
            
            if (s) {
                if (s.type === "dmg") {
                    multi += (s.power * s.count * ascBonus); 
                } else if (s.type === "buff") {
                    const buffUptime = (s.duration * s.count) / 60;
                    multi *= (1 + (s.dmgBonus * ascBonus * buffUptime)); 
                }
            }
        }
        return multi;
    };

    const myEff = calcEff(parsedData.my.stats, 'my');
    const enEff = calcEff(parsedData.enemy.stats, 'enemy');

    const winRate = ((myBase * myEff) / (myBase * myEff + enemyBase * enEff) * 100);
    const finalRate = Math.max(1, Math.min(99.9, winRate)).toFixed(1);
    
    document.getElementById('resultText').innerText = `예상 승리 확률: ${finalRate} %`;
    document.getElementById('winRateFill').style.width = `${finalRate}%`;

    let feedback = "";
    if (finalRate > 60) feedback = `🏆 예상 결과: <b>승리</b><br>전투력과 스킬 시너지가 상대를 완벽히 압도합니다.`;
    else if (finalRate > 40) feedback = `⚔️ 예상 결과: <b>박빙의 승부</b><br>능력치가 비슷합니다. 전투 내 운적 요소가 크게 작용합니다.`;
    else feedback = `⚠️ 예상 결과: <b>패배 위험</b><br>상대방의 스탯 및 옵션 효율이 더 높습니다. 스펙업이 필요합니다.`;
    
    document.getElementById('feedbackText').innerHTML = feedback;
});

document.getElementById('myImage').addEventListener('change', () => processImages('myImage', 'myStatus', 'myOptionList', 'my'));
document.getElementById('enemyImage').addEventListener('change', () => processImages('enemyImage', 'enemyStatus', 'enemyOptionList', 'enemy'));
