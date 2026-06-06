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

const ASCENSION_MULTIPLIERS = { 0: 1.0, 1: 49.0, 2: 2499.0, 3: 124999.0 };

// [옵션명 정규화]
function normalizeStatName(rawName) {
    if (rawName.includes("총") || rawName.includes("대장간") || rawName.includes("레벨") || rawName.includes("도감") || rawName.includes("장착")) return null;
    
    if (rawName.includes("치명") || rawName.includes("지명")) return (rawName.includes("피해") || rawName.includes("피애")) ? "치명타 피해" : "치명타 확률";
    if (rawName.includes("확률") || rawName.includes("블록") || rawName.includes("플록")) return "블록 확률";
    if (rawName.includes("흡수") || rawName.includes("생명")) return "생명력 흡수";
    if (rawName.includes("더블") || rawName.includes("찬스")) return "더블 찬스";
    if (rawName.includes("속도") || rawName.includes("공격")) return "공격 속도";
    
    if (rawName.includes("재생") || rawName.includes("제생")) return "체력 재생";
    if (rawName.match(/체력|채력|최력|체럭/)) return "체력";
    
    return null;
}

// [스캔 엔진: 하단 영역만 추출]
async function processImages(fileInputId, statusId, listId, playerKey) {
    const files = document.getElementById(fileInputId).files;
    if (files.length === 0) return;

    const statusEl = document.getElementById(statusId);
    statusEl.style.color = "#f9a826";
    parsedData[playerKey].stats = {}; 

    try {
        for (let i = 0; i < files.length; i++) {
            statusEl.innerText = `⏳ ${i + 1}/${files.length}번째 이미지 옵션 분석 중...`;
            
            const imgUrl = URL.createObjectURL(files[i]);
            const { data } = await Tesseract.recognize(imgUrl, 'kor+eng');
            URL.revokeObjectURL(imgUrl); 

            const imgHeight = data.imageHeight;

            data.lines.forEach(line => {
                // 핵심 로직: 이미지의 상단 60% 영역은 무조건 무시 (프로필 오인식 방지)
                if (line.baseline.top < imgHeight * 0.6) return;

                const text = line.text.replace(/\s+/g, '');
                const regex = /([+-]?)(\d+[\.,]?\d*)[^a-zA-Z가-힣0-9]*([a-zA-Z가-힣]+)/;
                const match = text.match(regex);
                
                if (match) {
                    const sign = match[1];
                    let value = parseFloat(match[2].replace(',', '.'));
                    if (sign === '-') value = -value;
                    if (Math.abs(value) > 30000) return;

                    const statName = normalizeStatName(match[3]);
                    if (statName) {
                        parsedData[playerKey].stats[statName] = value;
                    }
                }
            });
        }
        
        renderOptionList(parsedData[playerKey].stats, listId);
        statusEl.innerText = `✅ 스캔 완료 (하단 옵션만 추출됨)`;
        statusEl.style.color = "#4ade80";

    } catch (e) { 
        console.error(e);
        statusEl.innerText = `❌ 스캔 에러 발생`;
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
        const prefix = stats[name] > 0 ? "+" : "";
        container.innerHTML += `<div class="simple-option-item"><span class="opt-name">${name}</span><span class="opt-value">${prefix}${stats[name]}%</span></div>`;
    });
}

// [시뮬레이션 엔진]
document.getElementById('calcBtn').addEventListener('click', () => {
    const getMultiplier = (u) => ({'k': 1e3, 'm': 1e6, 'b': 1e9, 't': 1e12, 'q': 1e15}[u] || 1);
    const getVal = (v, u) => parseFloat(document.getElementById(v).value || 0) * getMultiplier(document.getElementById(u).value);

    const myBaseDmg = getVal('myDmgVal', 'myDmgUnit');
    const myBaseHp = getVal('myHpVal', 'myHpUnit');
    const enBaseDmg = getVal('enemyDmgVal', 'enemyDmgUnit');
    const enBaseHp = getVal('enemyHpVal', 'enemyHpUnit');

    if (myBaseHp === 0 || enBaseHp === 0 || myBaseDmg === 0 || enBaseDmg === 0) {
        alert("양쪽의 '총 피해'와 '총 체력'을 반드시 숫자로 기입해주세요!");
        return;
    }

    const isGuildWar = document.getElementById("isGuildWar").checked;

    // 플레이어 전투 수치 빌드 (Additive & Multiplier 혼합)
    const buildPlayer = (baseDmg, baseHp, stats, pKey) => {
        const getS = (k) => stats[k] / 100 || 0;
        const ascLevel = parseInt(document.getElementById(pKey + 'Ascension').value);
        const ascBonus = ASCENSION_MULTIPLIERS[ascLevel] || 1.0;

        let skillDpsMult = 0;
        let skillHpBonus = 0;

        // 스킬 연산 적용
        for (let i = 1; i <= 3; i++) {
            const s = SKILL_DB[document.getElementById(pKey + 'Skill' + i).value];
            if (s) {
                if (s.type === 'dmg') {
                    // 데미지 스킬을 초당 DPS 증가율로 환산
                    skillDpsMult += (s.power * s.count * ascBonus) / s.cooldown;
                } else if (s.type === 'buff') {
                    const uptime = Math.min(1, (s.duration * s.count) / 60);
                    skillHpBonus += s.hpBonus * ascBonus * uptime;
                    skillDpsMult += s.dmgBonus * ascBonus * uptime;
                }
            }
        }

        // 1. 체력: (입력된 베이스) * (길드전 보정) * (1 + 스킬 보너스)
        // (수동 입력 베이스에 이미 Additive 옵션이 포함되어 있다고 가정)
        const hpScale = isGuildWar ? 2.6 : 1.0;
        let totalHp = baseHp * hpScale * (1 + skillHpBonus);

        // 2. 피해량 곱연산: 공속 * 치명타배율 * 더블찬스
        let atkSpeed = 1 + getS("공격 속도");
        let critMult = 1 + (getS("치명타 확률") * (0.2 + getS("치명타 피해"))); // 기본 치명피해 1.2배 가정
        let doubleMult = 1 + getS("더블 찬스");

        let finalDps = baseDmg * (1 + skillDpsMult) * atkSpeed * critMult * doubleMult;

        // 3. 생존력 곱연산
        let regen = totalHp * getS("체력 재생");
        let lifesteal = finalDps * getS("생명력 흡수");
        let blockChance = getS("블록 확률"); // 블록 시 피해 50% 감소 가정

        return { hp: totalHp, maxHp: totalHp, dps: finalDps, regen, lifesteal, blockChance };
    };

    const my = buildPlayer(myBaseDmg, myBaseHp, parsedData.my.stats, 'my');
    const en = buildPlayer(enBaseDmg, enBaseHp, parsedData.enemy.stats, 'enemy');

    // 60초 전투 루프
    let timeElapsed = 60;
    let resultStr = "⚫ 타임 오버 (무승부)";
    let resultColor = "#8e8e9f";

    for (let t = 1; t <= 60; t++) {
        // 블록 확률을 반영한 기대 타격치 (RNG 요소를 배제하여 결과 일관성 유지)
        let expectedMyDmg = my.dps * (1 - (en.blockChance * 0.5)); 
        let expectedEnDmg = en.dps * (1 - (my.blockChance * 0.5));

        // 교전
        en.hp -= expectedMyDmg;
        my.hp -= expectedEnDmg;

        // 회복
        en.hp = Math.min(en.maxHp, en.hp + en.regen + en.lifesteal);
        my.hp = Math.min(my.maxHp, my.hp + my.regen + my.lifesteal);

        // 판정
        if (my.hp <= 0 && en.hp > 0) { 
            resultStr = "🔴 나의 패배"; resultColor = "#ff4b4b"; timeElapsed = t; break; 
        }
        if (en.hp <= 0 && my.hp > 0) { 
            resultStr = "🔵 나의 승리!!"; resultColor = "#4ade80"; timeElapsed = t; break; 
        }
        if (my.hp <= 0 && en.hp <= 0) { 
            resultStr = "⚫ 동시 사망"; resultColor = "#8e8e9f"; timeElapsed = t; break; 
        }
    }

    // 결과 UI 출력
    document.getElementById("resultTitle").innerHTML = `<span style="color:${resultColor}">${resultStr}</span> <span style="font-size:18px; color:#8e8e9f;">(${timeElapsed}초 소요)</span>`;
    
    document.getElementById("simulationDetails").innerHTML = `
        <div class="stat-box">
            <h4>🔵 나의 최종 전투력 지표</h4>
            <div class="stat-value blue">예상 초당 화력 (DPS): ${my.dps.toLocaleString('ko-KR', {maximumFractionDigits:0})}</div>
            <div class="stat-value green">초당 체력 회복 (HPS): ${(my.regen + my.lifesteal).toLocaleString('ko-KR', {maximumFractionDigits:0})}</div>
            <div style="font-size: 13px; color:#8e8e9f; margin-top:5px;">(체젠: ${my.regen.toFixed(0)} + 생흡: ${my.lifesteal.toFixed(0)})</div>
        </div>
        <div class="stat-box">
            <h4>🔴 상대방 전투력 지표</h4>
            <div class="stat-value red">예상 초당 화력 (DPS): ${en.dps.toLocaleString('ko-KR', {maximumFractionDigits:0})}</div>
            <div class="stat-value green">초당 체력 회복 (HPS): ${(en.regen + en.lifesteal).toLocaleString('ko-KR', {maximumFractionDigits:0})}</div>
        </div>
    `;
});

document.getElementById('myImage').addEventListener('change', () => processImages('myImage', 'myStatus', 'myOptionList', 'my'));
document.getElementById('enemyImage').addEventListener('change', () => processImages('enemyImage', 'enemyStatus', 'enemyOptionList', 'enemy'));
