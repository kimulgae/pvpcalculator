// 양쪽 데이터가 모두 준비되었는지 확인하는 플래그
let isMyDataReady = false;
let isEnemyDataReady = false;

// 파싱된 데이터를 저장할 메인 객체
const parsedData = {
    my: { power: 0, hp: 0, stats: {} },
    enemy: { power: 0, hp: 0, stats: {} }
};

// --- [1] 이미지 자동 분석 모듈 (기본 스탯 인식 강화) ---
async function processImage(fileInputId, statusId, listId, playerKey) {
    const file = document.getElementById(fileInputId).files[0];
    if (!file) return;

    const statusEl = document.getElementById(statusId);
    statusEl.innerText = "⏳ 스캔 준비 중...";
    statusEl.style.color = "#f9a826";

    try {
        const imageUrl = URL.createObjectURL(file);

        const { data: { text } } = await Tesseract.recognize(imageUrl, 'kor+eng', {
            logger: m => {
                if (m.status === 'recognizing text') {
                    statusEl.innerText = `🔍 이미지 분석 중... ${Math.round(m.progress * 100)}%`;
                } else if (m.status.includes('downloading')) {
                    statusEl.innerText = `📥 한국어 데이터 다운로드 중... (최초 1회만)`;
                } else {
                    statusEl.innerText = `⏳ AI 엔진 로딩 중...`;
                }
            }
        });
        
        // --- [핵심 개선] 스탯 추출 로직 고도화 ---
        let cleanText = text.replace(/,/g, ''); // 인식 오류를 막기 위해 콤마(,) 제거
        let power = 1;
        let hp = 1;

        // 1. 총 체력 추출 (단위 m, b 자동 변환)
        const hpMatch = cleanText.match(/([\d\.]+)\s*([mbMB]?)\s*총\s*체력/);
        if (hpMatch) {
            hp = parseFloat(hpMatch[1]);
            if (hpMatch[2].toLowerCase() === 'm') hp /= 1000; // m단위면 b단위(1/1000)로 환산
            cleanText = cleanText.replace(hpMatch[0], ''); // 다음 검색을 위해 지워둠
        }

        // 2. 총 피해 추출 (지워두기 용도)
        const dmgMatch = cleanText.match(/([\d\.]+)\s*([mbMB]?)\s*총\s*피해/);
        if (dmgMatch) {
            cleanText = cleanText.replace(dmgMatch[0], '');
        }

        // 3. 전투력 추출 (남아있는 텍스트 중 b나 m이 붙은 가장 큰 숫자를 전투력으로 간주)
        const cpMatch = cleanText.match(/([\d\.]+)\s*([mbMB])/);
        if (cpMatch) {
            power = parseFloat(cpMatch[1]);
            if (cpMatch[2].toLowerCase() === 'm') power /= 1000;
        }

        parsedData[playerKey].power = power;
        parsedData[playerKey].hp = hp;
        // ----------------------------------------

        // 4. 만능 옵션 스캐너 (텍스트 전체에서 % 옵션 수치만 긁어모음)
        const extractedStats = {};
        const lines = text.split('\n');
        
        lines.forEach(line => {
            const match = line.match(/(?:\+|-)?\s*([\d\.]+)\s*%\s*([가-힣a-zA-Z\s]+)/);
            if (match) {
                const value = parseFloat(match[1]);
                const name = match[2].trim();
                extractedStats[name] = value;
            }
        });

        parsedData[playerKey].stats = extractedStats;

        // 5. UI 업데이트
        renderOptionList(extractedStats, listId);

        // 표시용 포맷팅 (소수점 2자리)
        const displayPower = power === 1 ? "?" : power.toFixed(2);
        const displayHp = hp === 1 ? "?" : hp.toFixed(2);

        statusEl.innerText = `✅ 스캔 완료! (전투력: ${displayPower}B / 체력: ${displayHp}B)`;
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
    container.innerHTML = ""; // 기존 내용 비우기

    const keys = Object.keys(stats);
    if (keys.length === 0) {
        container.innerHTML = "<p style='color: #8e8e9f; font-size: 13px; margin-top: 10px;'>인식된 세부 옵션이 없습니다.</p>";
        return;
    }

    keys.forEach(optionName => {
        const value = stats[optionName];
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
    const myBase = parsedData.my.power * parsedData.my.hp;
    const enemyBase = parsedData.enemy.power * parsedData.enemy.hp;

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
