// ==========================================
// 1. 状态管理配置 (抽签专用)
// ==========================================
let options = []; 
let historyRecords = [];
let userBanStatusMap = {}; 

// 扩展功能状态
let activeBanStyle = "";
let activeBanPosition = "";
let activeFreeCost = "";
let activeDoubleDraw = false;

// 从 LocalStorage 读取当前用户状态
let currentUser = localStorage.getItem('currentUser');

// ==========================================
// 2. 页面加载初始化
// ==========================================
window.onload = async () => {
    if (!currentUser) {
        alert("请先登录！");
        window.location.href = 'index.html';
        return;
    }

    // 设置UI显示
    document.getElementById("current-user-display").innerText = `(当前操作人: ${currentUser})`;

    // 如果用户是 OB，隐藏“抽！”按钮以及旁边的所有功能
    if (currentUser === 'OB') {
        const drawBtn = document.getElementById("draw-btn");
        if (drawBtn && drawBtn.parentElement) {
            drawBtn.parentElement.style.display = "none";
        }
    }

    // 初始化数据
    await fetchOptions(); 
    await fetchUserBanStatus(); 
    await fetchHistory();
    setupRealtime(); 
    
    // 恢复UI状态
    updateBanDisplay();
    document.getElementById("result").innerText = "等待中..."; 
    document.getElementById("draw-btn").disabled = false;
    
    // 初始化预存按钮状态
    updateLockButtonState();
};

async function fetchOptions() {
    const { data, error } = await supabaseClient
        .from('characters_pool') 
        .select('num, name, fengge, position, cost, available');

    if (error) {
        console.error("读取抽签选项失败:", error);
        document.getElementById("system-status").innerText = "读取选项配置失败，请检查数据库。";
        return;
    }
    
    options = data || [];
}

async function fetchUserBanStatus() {
    const { data, error } = await supabaseClient
        .from('user_ban_status')
        .select('*');
    if (!error && data) {
        userBanStatusMap = {};
        data.forEach(row => {
            userBanStatusMap[row.username] = {
                style: row.used_ban_style,
                position: row.used_ban_position,
                freeCost: row.used_free_cost,
                doubleDraw: row.used_double_draw,
                lockedDraw: row.locked_draw // 读取预存状态
            };
        });
    } else if (error) {
        console.error("读取用户BAN状态失败:", error);
    }
}

async function fetchHistory() {
    const { data, error } = await supabaseClient
        .from('draw_history')
        .select('*')
        .order('created_at', { ascending: true }); 

    if (error) {
        console.error("读取数据失败:", error);
        document.getElementById("system-status").innerText = "数据库连接失败，请检查配置。";
        return;
    }

    historyRecords = data.map(row => ({
        user: row.username,
        draw: row.draw_name
    }));
    renderHistory();
    updateLockButtonState();
}

function setupRealtime() {
    supabaseClient
        .channel('public:draw_history')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'draw_history' }, async payload => {
            const newRecord = payload.new;
            historyRecords.push({ user: newRecord.username, draw: newRecord.draw_name });
            await fetchUserBanStatus(); 
            renderHistory();
            updateLockButtonState();
        })
        .subscribe();
}

// ==========================================
// 预存功能相关逻辑
// ==========================================
function updateLockButtonState() {
    const lockBtn = document.getElementById("lock-btn");
    if (!lockBtn || currentUser === 'OB') return;

    const userDraws = historyRecords.filter(r => r.user === currentUser);
    const currentStatus = userBanStatusMap[currentUser] || {};

    if (currentStatus.lockedDraw) {
        // 如果已经锁过了
        lockBtn.style.display = "inline-block";
        lockBtn.disabled = true;
        lockBtn.innerText = "已预存";
        lockBtn.style.backgroundColor = "#ccc"; 
        lockBtn.style.borderColor = "#bbb";
        lockBtn.style.color = "#666";
    } else if (userDraws.length > 0) {
        // 如果抽过且没锁过
        lockBtn.style.display = "inline-block";
        lockBtn.disabled = false;
        lockBtn.innerText = "预存";
        lockBtn.style.backgroundColor = ""; 
        lockBtn.style.borderColor = "";
        lockBtn.style.color = "";
    } else {
        // 还没抽过，隐藏按钮
        lockBtn.style.display = "none";
    }
}

async function lockCurrentDraw() {
    const userDraws = historyRecords.filter(r => r.user === currentUser);
    if (userDraws.length === 0) return;

    // 获取该用户最后一次抽的签
    const latestDraw = userDraws[userDraws.length - 1].draw;
    const currentStatus = userBanStatusMap[currentUser] || {};

    if (currentStatus.lockedDraw) {
        alert("您已经预存过一个签了，每个账号仅限预存一次！");
        return;
    }

    if (confirm(`确定要预存当前的签【${latestDraw}】吗？\n\n预存后此签将永久生效，不可被别人抽走，并且您可以继续抽取其他签！\n\n注意：每个账号仅限预存一次，不可撤销。`)) {
        const lockBtn = document.getElementById("lock-btn");
        lockBtn.disabled = true;
        lockBtn.innerText = "预存中...";

        // 保存时必须连带已有的配置一起保存，防止覆盖成 null
        const statusToSave = {
            username: currentUser,
            used_ban_style: currentStatus.style || false,
            used_ban_position: currentStatus.position || false,
            used_double_draw: currentStatus.doubleDraw || false,
            used_free_cost: currentStatus.freeCost || null,
            locked_draw: latestDraw
        };

        const { error } = await supabaseClient.from('user_ban_status').upsert([statusToSave]);

        if (error) {
            console.error("预存失败:", error);
            alert("网络错误，预存失败，请重试！");
            lockBtn.disabled = false;
            lockBtn.innerText = "预存";
        } else {
            if (!userBanStatusMap[currentUser]) userBanStatusMap[currentUser] = {};
            userBanStatusMap[currentUser].lockedDraw = latestDraw;
            updateLockButtonState();
            renderHistory();
        }
    }
}

// ==========================================
// 扩展功能 Modal
// ==========================================
function showExtModal() {
    // BAN风格
    document.getElementById("chk-ban-style").checked = !!activeBanStyle;
    document.getElementById("input-ban-style").value = activeBanStyle || "";
    toggleBanInput('style');

    // BAN注册
    document.getElementById("chk-ban-position").checked = !!activeBanPosition;
    document.getElementById("input-ban-position").value = activeBanPosition || "";
    toggleBanInput('position');

    // 一次抽两个（自由取消）
    document.getElementById("chk-ban-double").checked = activeDoubleDraw;
    document.getElementById("chk-ban-double").disabled = false;

    // X费之前免费（处理数据库已预存的情况）
    const lockedCost = userBanStatusMap[currentUser] && userBanStatusMap[currentUser].freeCost;
    if (lockedCost) {
        document.getElementById("chk-ban-cost").checked = true;
        document.getElementById("chk-ban-cost").disabled = true; 
        document.getElementById("input-ban-cost").value = lockedCost;
        document.getElementById("input-ban-cost").disabled = true; 
        document.getElementById("input-ban-cost").style.display = "inline-block";
    } else {
        document.getElementById("chk-ban-cost").disabled = false;
        document.getElementById("chk-ban-cost").checked = !!activeFreeCost;
        document.getElementById("input-ban-cost").disabled = false;
        document.getElementById("input-ban-cost").value = activeFreeCost || "";
        toggleBanInput('cost');
    }

    document.getElementById("ext-modal-overlay").style.display = "flex";
}

function hideExtModal() {
    document.getElementById("ext-modal-overlay").style.display = "none";
}

function toggleBanInput(type) {
    const isChecked = document.getElementById(`chk-ban-${type}`).checked;
    document.getElementById(`input-ban-${type}`).style.display = isChecked ? "inline-block" : "none";
}

function saveExtFeatures() {
    const isBanStyleChecked = document.getElementById("chk-ban-style").checked;
    const isBanPositionChecked = document.getElementById("chk-ban-position").checked;
    const isBanDoubleChecked = document.getElementById("chk-ban-double").checked;
    const isBanCostChecked = document.getElementById("chk-ban-cost").checked;

    const styleVal = document.getElementById("input-ban-style").value.trim();
    const posVal = document.getElementById("input-ban-position").value.trim();
    const costVal = document.getElementById("input-ban-cost").value.trim();

    if (isBanStyleChecked && !styleVal) {
        alert("请在下拉框中选择要BAN的风格！");
        return;
    }
    if (isBanPositionChecked && !posVal) {
        alert("请在下拉框中选择要BAN的注册位置！");
        return;
    }
    
    const isCostLocked = userBanStatusMap[currentUser] && userBanStatusMap[currentUser].freeCost;
    if (isBanCostChecked && !costVal && !isCostLocked) {
        alert("请在下拉框中选择免费的费用！");
        return;
    }

    activeBanStyle = isBanStyleChecked ? styleVal : "";
    activeBanPosition = isBanPositionChecked ? posVal : "";
    activeDoubleDraw = isBanDoubleChecked;

    if (!isCostLocked) {
        activeFreeCost = isBanCostChecked ? costVal : "";
    }

    updateBanDisplay();
    hideExtModal();
}

function clearBan(type) {
    if (type === 'style') activeBanStyle = "";
    if (type === 'position') activeBanPosition = "";
    if (type === 'double') activeDoubleDraw = false;
    if (type === 'cost') activeFreeCost = "";
    updateBanDisplay();
}

function updateBanDisplay() {
    const styleDisplay = document.getElementById("ban-style-display");
    const positionDisplay = document.getElementById("ban-position-display");
    const doubleDisplay = document.getElementById("ban-double-display");
    const costDisplay = document.getElementById("ban-cost-display"); 

    if (activeBanStyle) {
        document.getElementById("ban-style-text").innerText = activeBanStyle;
        styleDisplay.style.display = "inline-block";
    } else {
        styleDisplay.style.display = "none";
    }

    if (activeBanPosition) {
        document.getElementById("ban-position-text").innerText = activeBanPosition;
        positionDisplay.style.display = "inline-block";
    } else {
        positionDisplay.style.display = "none";
    }

    if (activeDoubleDraw) {
        doubleDisplay.style.display = "inline-block";
        document.getElementById("btn-clear-double").style.display = "inline-block";
    } else {
        doubleDisplay.style.display = "none";
    }

    const lockedCost = userBanStatusMap[currentUser] && userBanStatusMap[currentUser].freeCost;
    const displayCost = lockedCost || activeFreeCost;

    if (displayCost) {
        document.getElementById("ban-cost-text").innerText = `${displayCost}费之前免费`;
        costDisplay.style.display = "inline-block";
        document.getElementById("btn-clear-cost").style.display = lockedCost ? "none" : "inline-block";
    } else {
        costDisplay.style.display = "none";
    }
}

// ==========================================
// 抽卡核心流程
// ==========================================
function showDrawModal() {
    if (options.length === 0) {
        alert("抽签选项池为空，请检查数据库配置！");
        return;
    }

    const hasCurrentUserDrawn = historyRecords.some(record => record.user === currentUser);
    const modalText = hasCurrentUserDrawn ? "是否确认重抽？" : "是否确认开始抽签？";
    
    document.getElementById("draw-modal-text").innerText = modalText;
    document.getElementById("draw-modal-overlay").style.display = "flex";
}

function hideDrawModal() {
    document.getElementById("draw-modal-overlay").style.display = "none";
}

async function confirmDraw() {
    hideDrawModal();
    
    const drawBtn = document.getElementById("draw-btn");
    drawBtn.disabled = true;
    document.getElementById("result").innerText = "抽取中...";

    const latestDrawsMap = {};
    historyRecords.forEach(record => {
        const names = record.draw.split('&');
        if (!latestDrawsMap[record.user]) {
            latestDrawsMap[record.user] = [];
        }
        latestDrawsMap[record.user] = names; 
    });

    const unavailableOptions = [];
    
    // 排除其他人当前最新的签
    for (const user in latestDrawsMap) {
        if (user !== currentUser) { 
            unavailableOptions.push(...latestDrawsMap[user]);
        }
    }

    // 排除所有人（含自己）已经被预存的签，避免再次被抽出
    for (const user in userBanStatusMap) {
        if (userBanStatusMap[user].lockedDraw) {
            const lockedNames = userBanStatusMap[user].lockedDraw.split('&');
            unavailableOptions.push(...lockedNames);
        }
    }

    let availableOptions = options.filter(opt => opt.available !== false && !unavailableOptions.includes(opt.name));

    if (activeBanStyle) {
        availableOptions = availableOptions.filter(opt => opt.fengge !== activeBanStyle);
    }
    if (activeBanPosition) {
        availableOptions = availableOptions.filter(opt => opt.position !== activeBanPosition);
    }

    let drawnName = "";
    const currentStatus = userBanStatusMap[currentUser] || { style: false, position: false, doubleDraw: false, freeCost: null, lockedDraw: null };
    
    const isUsingDoubleDraw = activeDoubleDraw;

    if (isUsingDoubleDraw) {
        if (availableOptions.length < 2) {
            alert("根据当前过滤条件（或签已被抢光），没有足够的签可以同时抽取两个！");
            document.getElementById("result").innerText = "无可用签";
            drawBtn.disabled = false;
            return;
        }
        const idx1 = Math.floor(Math.random() * availableOptions.length);
        const drawnItem1 = availableOptions[idx1];
        availableOptions.splice(idx1, 1); 
        
        const idx2 = Math.floor(Math.random() * availableOptions.length);
        const drawnItem2 = availableOptions[idx2];
        
        drawnName = drawnItem1.name + "&" + drawnItem2.name;
    } else {
        if (availableOptions.length === 0) {
            alert("根据当前过滤条件（或签已被抢光），没有符合条件的签可以抽取！");
            document.getElementById("result").innerText = "无可用签";
            drawBtn.disabled = false;
            return;
        }
        const randomIndex = Math.floor(Math.random() * availableOptions.length);
        const drawnItem = availableOptions[randomIndex];
        drawnName = drawnItem.name; 
    }

    // 1. 先算好签名
    const sign = generateSignature(currentUser, drawnName);

    // 2. 把签名打包进要发送的数组里
    const { error } = await supabaseClient
        .from('draw_history')
        .insert([{ 
            username: currentUser, 
            draw_name: drawnName, 
            sys_sign: sign   // <==== 就是加了这一行！
        }]);

    if (error) {
        console.error("写入抽签记录失败:", error);
        alert("网络错误，抽签结果保存失败，请重试！");
        document.getElementById("result").innerText = "等待中...";
        drawBtn.disabled = false;
        return;
    }

    const newStyle = currentStatus.style || !!activeBanStyle;
    const newPosition = currentStatus.position || !!activeBanPosition;
    const newDoubleDraw = currentStatus.doubleDraw || isUsingDoubleDraw;
    const newFreeCost = currentStatus.freeCost || activeFreeCost || null; 
    
    if (newStyle !== currentStatus.style || newPosition !== currentStatus.position || newDoubleDraw !== currentStatus.doubleDraw || newFreeCost !== currentStatus.freeCost) {
        const { error: banError } = await supabaseClient
            .from('user_ban_status')
            .upsert([{ 
                username: currentUser, 
                used_ban_style: newStyle, 
                used_ban_position: newPosition,
                used_double_draw: newDoubleDraw,
                used_free_cost: newFreeCost,
                locked_draw: currentStatus.lockedDraw || null // 必须保留已有预存记录
            }]);
        
        if (!banError) {
            userBanStatusMap[currentUser] = { style: newStyle, position: newPosition, doubleDraw: newDoubleDraw, freeCost: newFreeCost, lockedDraw: currentStatus.lockedDraw };
            updateBanDisplay(); 
        } else {
            console.error("更新用户状态失败:", banError);
        }
    }

    document.getElementById("result").innerText = drawnName;
    await fetchHistory();
    drawBtn.disabled = false;
}

// ==========================================
// 历史记录渲染
// ==========================================
function renderHistory() {
    const listDiv = document.getElementById("history-list");
    listDiv.innerHTML = ""; 

    if (historyRecords.length === 0) {
        listDiv.innerText = "暂无记录";
        return;
    }

    const userDrawsMap = {};
    historyRecords.forEach(record => {
        if (!userDrawsMap[record.user]) {
            userDrawsMap[record.user] = [];
        }
        userDrawsMap[record.user].push(record.draw);
    });

    for (const user in userDrawsMap) {
        const rowDiv = document.createElement("div");
        rowDiv.className = "history-row";

        const userSpan = document.createElement("span");
        userSpan.className = "history-user";
        
        let htmlContent = user;
        const status = userBanStatusMap[user] || { style: false, position: false, doubleDraw: false, freeCost: null, lockedDraw: null };
        
        if (status.style) {
            htmlContent += `<span style="color: #c62828; margin-left: 2px;">*</span>`; 
        }
        if (status.position) {
            htmlContent += `<span style="color: #2e7d32; margin-left: 2px;">*</span>`; 
        }
        if (status.doubleDraw) {
            htmlContent += `<span style="color: #ff9800; margin-left: 2px;">*</span>`; 
        }
        if (status.freeCost) {
            htmlContent += `<span style="color: #1565c0; font-weight: bold; margin-left: 2px;">${status.freeCost}</span>`;
        }
        
        htmlContent += "：";
        userSpan.innerHTML = htmlContent;
        rowDiv.appendChild(userSpan);

        const draws = userDrawsMap[user];
        let freeConditionMet = false; 
        let validDrawCount = 0; 

        for (let i = 0; i < draws.length; i++) {
            const drawSpan = document.createElement("span");
            let drawText = draws[i];
            drawSpan.className = "history-item ";
            
            // 当前这一个签是否是最新抽的，或者是否是已经被预存的
            const isLatest = (i === draws.length - 1);
            const isLocked = (status.lockedDraw && draws[i] === status.lockedDraw);
            
            if (isLatest || isLocked) {
                drawSpan.className += "history-black";
            } else {
                drawSpan.className += "history-gray";
            }

            // 如果是被预存的签，加上表情符号（已去除前方的空格）
            if (isLocked) {
                drawText += "🔒";
            }
            
            drawSpan.innerText = drawText;

            // 下划线判断逻辑
            let shouldUnderline = false;
            if (status.freeCost) {
                if (!freeConditionMet) {
                    const singleNames = draws[i].split('&');
                    let hasMatchingCost = false;
                    
                    for (const sName of singleNames) {
                        const charObj = options.find(opt => opt.name === sName);
                        if (charObj && String(charObj.cost) === String(status.freeCost)) {
                            hasMatchingCost = true;
                            break;
                        }
                    }
                    
                    if (hasMatchingCost) {
                        freeConditionMet = true;
                    } else {
                        shouldUnderline = true;
                    }
                }
            }

            if (shouldUnderline) {
                drawSpan.style.textDecoration = "underline";
            } else {
                validDrawCount++;
            }

            rowDiv.appendChild(drawSpan);

            if (i < draws.length - 1) {
                const commaNode = document.createTextNode("  ");
                rowDiv.appendChild(commaNode);
            }
        }

        const totalCost = Math.pow(2, validDrawCount + 1) - 2;
        const costSpan = document.createElement("span");
        costSpan.style.color = "rgb(255, 0, 0)";
        costSpan.style.marginLeft = "15px";
        costSpan.style.fontSize = "18px";
        costSpan.innerText = `[总花费：${totalCost}]`;
        
        rowDiv.appendChild(costSpan);
        listDiv.appendChild(rowDiv);
    }
}

// 这是一个轻量级的字符串 Hash 算法 + 你的专属“盐”
// ==========================================
function generateSignature(username, content) {
    // 你的专属“盐”，务必保密
    const salt = "Iodine&Thorium&Thulium&Thallium!"; 
    const str = username + "_" + content + "_" + salt;
    
    // 调用 CryptoJS 直接生成 64 位的 SHA-256 顶级哈希签名
    return CryptoJS.SHA256(str).toString(CryptoJS.enc.Hex);
}