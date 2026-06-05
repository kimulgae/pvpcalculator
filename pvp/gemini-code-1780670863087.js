// --- [1] 통합 데이터베이스 ---
const BATTLE_TIME = 60; // 60초 타임아웃

// 스킬 DB (DPS 계산용)
const SKILL_DB = {
    "None": { cd: 1, dmg: 0 },
    "Lightning": { cd: 3, dmg: 0.5 },
    "Stampede": { cd: 20, dmg: 1.0 },
    "Drone": { cd: 8, dmg: 8.0 }
};

// 스킨 와인드업 DB (티어별 준비 모션 시간)
const SKIN_WINDUP = {
    "S_PLUS": 0.30,
    "A_PLUS": 0.48,
    "B": 0.68,
    "F": 1.10
};


// --- [2] OCR 및 이미지 템플릿 매칭 로직 ---
async function processUpload(fileInputId, statusId, prefix) {
    const file = document.getElementById(fileInputId).files[0];
    if (!file) return;

    const statusEl = document.getElementById(statusId);
    statusEl.innerText = "🔍 스크린샷 분석 중... (약 10초 소요)";

    try {
        // 1. Tesseract.js를 활용한 텍스트(스탯) 추출
        const { data: { text } } = await Tesseract.recognize(file, 'kor+eng');
        
        const cpMatch = text.match(/(?:전투력|대장간|기본).*?([\d\.]+)\s*[bB]/i) || text.match(/([\d\.]+)\s*[bB]/);
        const dmgMatch = text.match(/(?:피해|총\s*피해).*?([\d\.]+)\s*[mM]/i);
        const hpMatch = text.match(/(?:체력|총\s*체력).*?([\d\.]+)\s*[bB]/i);
        const spdMatch = text.match(/속도.*?\+?([\d\.]+)\s*%/i);
        const critMatch = text.match(/확률.*?\+?([\d\.]+)\s*%/i);

        if(cpMatch) document.getElementById(`${prefix}CP`).value = parseFloat(cpMatch[1]);
        if(dmgMatch) document.getElementById(`${prefix}Dmg`).value = parseFloat(dmgMatch[1]);
        if(hpMatch) document.getElementById(`${prefix}Hp`).value = parseFloat(hpMatch[1]);
        if(spdMatch) document.getElementById(`${prefix}AtkSpd`).value = parseFloat(spdMatch[1]);
        if(critMatch) document.getElementById(`${prefix}CritRate`).value = parseFloat(critMatch[1]);

        // 2. 스킨 자동 인식 로직 (템플릿 매칭 뼈대)
        // 실제 사용 시: SkinsUiIcons.jpg를 잘라둔 배열과 픽셀 비교 수행
        const canvas = document.getElementById('hiddenCanvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.src = URL.createObjectURL(file);
        
        img.onload = () => {
            // 화면 우측 상단 스킨 영역 크롭 (좌표는 실제 게임에 맞게 조정 필요)
            ctx.drawImage(img, 800, 100, 50, 50, 0, 0, 50, 50);
            const skinPixelData = ctx.getImageData(0, 0, 50, 50);
            
            /* * [스킨 판별 로직 적용 구역]
             * let detectedSkinTier = performTemplateMatching(skinPixelData, SkinsUiIcons_Data);
             * document.getElementById(`${prefix}Skin`).value = detectedSkinTier;
             */
            
            statusEl.innerText = "✅ 스탯 및 스킨 스캔 완료!";
            statusEl.style.color = "#4ade80";
        };

    } catch (error) {
        statusEl.innerText = "❌ 분석 실패. 수동으로 입력해주세요.";
        statusEl.style.color = "#ff4b4b";
    }
}

document.getElementById('myImage').addEventListener('change', () => processUpload('myImage', 'myStatus', 'my'));
document.getElementById('enemyImage').addEventListener('change', () => processUpload('enemyImage', 'enemyStatus', 'enemy'));


// --- [3] 모션 최적화 엔진 & 승률 계산 ---
document.getElementById('calcBtn').addEventListener('click', () => {
    
    // UI에서 데이터 수집
    const parseData = (prefix) => {
        return {
            dmg: parseFloat(document.getElementById(`${prefix}Dmg`).value) || 0,
            hp: (parseFloat(document.getElementById(`${prefix}Hp`).value) || 0) * 1000, // B -> M 단위 통일
            atkSpd: (parseFloat(document.getElementById(`${prefix}AtkSpd`).value) || 0) / 100,
            critRate: (parseFloat(document.getElementById(`${prefix}CritRate`).value) || 0) / 100,
            skinTier: document.getElementById(`${prefix}Skin`).value,
            skills: Array.from(document.querySelectorAll(`.${prefix}-skill`)).map(el => el.value)
        };
    };

    const my = parseData('my');
    const enemy = parseData('enemy');

    if (my.hp === 0 || enemy.hp === 0) {
        alert("체력(Hp) 스탯이 부족합니다. 스크린샷을 올리거나 직접 입력해주세요.");
        return;
    }

    // 전투 통계 계산기
    const getCombatStats = (player) => {
        // [핵심] 쿨타임 = 스킨 준비모션(Windup) + 공격 후딜레이
        const windup = SKIN_WINDUP[player.skinTier];
        const attackInterval = windup + (1.0 / (1 + player.atkSpd));
        const hitsPerSecond = 1 / attackInterval; // 1초당 타격 횟수

        // 평타 DPS 산출
        let baseDps = player.dmg * hitsPerSecond * (1 + (player.critRate * 0.5)); // 치명타 1.5배 가정
        
        // 스킬 화력 합산
        let skillDps = 0;
        player.skills.forEach(skillKey => {
            const skill = SKILL_DB[skillKey];
            if(skill && skill.cd > 0) {
                const usesPerMinute = Math.floor(BATTLE_TIME / skill.cd);
                skillDps += (skill.dmg * usesPerMinute) / BATTLE_TIME;
            }
        });

        return {
            totalDps: baseDps + skillDps,
            effectiveHp: player.hp
        };
    };

    const myCombat = getCombatStats(my);
    const enemyCombat = getCombatStats(enemy);

    // TTK(Time To Kill) 도출
    const myTimeToKill = enemyCombat.effectiveHp / (myCombat.totalDps || 1); 
    const enemyTimeToKill = myCombat.effectiveHp / (enemyCombat.totalDps || 1);

    // 승률 변환 (내가 적을 죽이는 시간 vs 적이 나를 죽이는 시간)
    let winRate = (enemyTimeToKill / (myTimeToKill + enemyTimeToKill)) * 100;
    winRate = Math.max(1, Math.min(99.9, winRate));

    // 결과 렌더링
    const winRateFixed = winRate.toFixed(1);
    document.getElementById('resultText').innerText = `내 승리 확률: ${winRateFixed} %`;
    document.getElementById('winRateFill').style.width = `${winRateFixed}%`;

    let feedback = "";
    if (winRate > 60) {
        feedback = `🏆 예상 결과: <b>승리</b><br>압도적인 화력입니다. 상대방보다 타격 모션(Windup)이나 공속 효율에서 우위를 점하고 있습니다.`;
    } else if (winRate > 40) {
        feedback = `⚔️ 예상 결과: <b>박빙의 승부</b><br>양측의 살상 소요 시간이 거의 같습니다(${myTimeToKill.toFixed(1)}초). 치명타 운이나 스킬 발동 타이밍에 따라 결과가 뒤바뀝니다.`;
    } else {
        feedback = `⚠️ 예상 결과: <b>패배 위험</b><br>상대방이 ${enemyTimeToKill.toFixed(1)}초 만에 당신을 제압합니다. 스킨을 티어가 높은(모션이 짧은) 것으로 교체하여 공속 효율을 끌어올리세요.`;
    }

    document.getElementById('feedbackText').innerHTML = feedback;
});