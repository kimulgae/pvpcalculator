const parsedData = {
    my: { stats: {} },
    enemy: { stats: {} }
};

// HTML 코드를 깔끔하게 하기 위해 JS에서 스킬 목록을 동적으로 넣어줍니다.
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

// [1] 스킬 데이터베이스 (60초 전투 기준)
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

// [2] 승천 단계별 폭발적인 배율 데이터
const ASCENSION_MULTIPLIERS = {
    0: 1.0,
    1: 49.0,
    2: 2499.0,
    3: 124999.0
};

// [3] 옵션 이름 교정기 (오독 및 유령옵션 방지)
function normalizeStatName(rawName) {
    const str = rawName.replace(/\s+/g, '').toUpperCase(); 
    if (str.includes("확률") || str.includes("확럴") || str.includes("확룰")) return (str.includes("블록") || str.includes("블럭")) ? "블록 확률" : "치명타 확률"; 
    if (str.includes("재생")) return "체력 재생";
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

// [4] 자동 스캐너 (순수하게 옵션만 빠르고 정확하게 스캔)
async function processImages(fileInputId, statusId, listId, playerKey) {
    const files = document.getElementById(fileInputId).files;
    if (files.length === 0) return;

    const statusEl = document.getElementById(statusId);
    statusEl.innerText = `⏳ 총 ${files.length}장의 이미지 스캔 중...`;
    statusEl.style.color = "#f9a826";

    parsedData[playerKey].stats = {}; 

    try {
        for (let i = 0; i < files.length; i++) {
            const { data: { text } } = await Tesseract.recognize(URL.createObjectURL(files[i]), 'kor+eng');

            text.split('\n').forEach(line => {
                const optMatch = line.match(/(?:\+|-)?\s*([\d\.,]+)\s*%\s*([가-힣a-zA-Z\s]+)/);
                if (optMatch) {
                    const cleanName = normalizeStatName(optMatch[2].trim());
                    if (cleanName !== null) parsedData[playerKey].stats[cleanName] = parseFloat(optMatch[1].replace(/,/g, '.')); 
                }
            });
        }
        
        renderOptionList(parsedData[playerKey].stats, listId);
        statusEl.innerText = `✅ 세부 옵션 스캔 완료!`;
        statusEl.style.color = "#4ade80";

    } catch (e) { 
        statusEl.innerText = `❌ 에러 발생: 이미지를 인식할 수 없습니다.`;
        statusEl.style.color = "#ff4b4b";
    }
}

function renderOptionList(stats, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = ""; 
    if(Object.keys(stats).length === 0) {
        container.innerHTML = "<p style='color: #8e8e9f; font-size: 13px; margin-top: 10px;'>인식된 세부 옵션이 없습니다.</p>";
        return;
    }
    Object.keys(stats).forEach(name => {
        const prefix = name.includes("대기시간") ? "-" : "+";
        container.innerHTML += `<div class="simple-option-item"><span class="opt-name">${name}</span><span class="opt-value">${prefix}${stats[name]}%</span></div>`;
    });
}

// [5] 정밀 승률 예측 엔진 (기본 스탯 + 옵션 시너지 + 승천 스킬 배율)
document.getElementById('calcBtn').addEventListener('click', () => {
    
    // K, M, B 등 단위 변환
    const getMultiplier = (u) => ({'k': 1e3, 'm': 1e6, 'b': 1e9, 't': 1e12, 'q': 1e15}[u] || 1);
    const getVal = (v, u) => parseFloat(document.getElementById(v).value || 0) * getMultiplier(document.getElementById(u).value);

    const myBase = getVal('myDmgVal', 'myDmgUnit') * getVal('myHpVal', 'myHpUnit');
    const enemyBase = getVal('enemyDmgVal', 'enemyDmgUnit') * getVal('enemyHpVal', 'enemyHpUnit');

    if (myBase === 0 || enemyBase === 0) {
        alert("양쪽의 '총 피해'와 '총 체력'을 모두 숫자로 입력해주세요!");
        return;
    }

    // 시너지 계산 로직
    const calcEff = (stats, pKey) => {
        const getS = (k) => stats[Object.keys(stats).find(x => x.includes(k))] / 100 || 0;
        
        // 1. 기본 옵션 시너지 합산
        let multi = 1.0;
        multi *= (1 + getS("피해"));
        multi *= (1 + getS("공격 속도"));
        multi *= (1 + getS("더블 찬스"));
        multi *= (1 + (getS("치명타 확률") * (0.2 + getS("치명타 피해"))));

        // 2. 3개의 스킬 슬롯과 각 스킬의 승천 배율 누적 계산
        for (let i = 1; i <= 3; i++) {
            const skillKey = document.getElementById(pKey + 'Skill' + i).value;
            const ascLevel = parseInt(document.getElementById(pKey + 'Skill' + i + 'Asc').value);
            const s = SKILL_DB[skillKey];
            
            if (s) {
                const ascBonus = ASCENSION_MULTIPLIERS[ascLevel] || 1.0; // 승천 배율 가져오기
                
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

    // 최종 승률 계산
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

// 이벤트 리스너 연결
document.getElementById('myImage').addEventListener('change', () => processImages('myImage', 'myStatus', 'myOptionList', 'my'));
document.getElementById('enemyImage').addEventListener('change', () => processImages('enemyImage', 'enemyStatus', 'enemyOptionList', 'enemy'));
