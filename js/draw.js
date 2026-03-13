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

// 从 LocalStorage 读取当前用户状态 (注意这里，不要再写 let currentUser = "" 了)
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

    // === 新增：如果用户是 OB，隐藏“抽！”按钮以及旁边的所有功能，并显示下载按钮 ===
    if (currentUser === 'OB') {
        const drawBtn = document.getElementById("draw-btn");
        if (drawBtn && drawBtn.parentElement) {
            drawBtn.parentElement.style.display = "none";
        }

        const obDownloadArea = document.getElementById("ob-download-area");
        if (obDownloadArea) {
            obDownloadArea.style.display = "block";
        }
    }

    // 初始化数据
    await fetchOptions(); 
    await fetchUserBanStatus(); 
    await fetchHistory();
    setupRealtime(); 
    
    // 恢复UI状态
    updateBanDisplay();
    document.getElementById("result").innerText = "等待中..."; // 这里才会把“读取中”替换掉
    document.getElementById("draw-btn").disabled = false;
};

// ... 下面继续粘贴你原先的 fetchOptions、fetchHistory、confirmDraw 等函数 ...

async function downloadDrawHistoryAsXls() {
    if (currentUser !== 'OB') {
        alert('仅 OB 用户可下载文档。');
        return;
    }

    const downloadBtn = document.getElementById('download-doc-btn');
    if (downloadBtn) {
        downloadBtn.disabled = true;
        downloadBtn.innerText = '生成中...';
    }

    try {
        const { data, error } = await supabaseClient
            .from('draw_history')
            .select('username, draw_name, created_at')
            .order('username', { ascending: true })
            .order('created_at', { ascending: true });

        if (error) {
            throw error;
        }

        const rows = data || [];
        let tableRows = '';

        rows.forEach((row, index) => {
            const drawTime = row.created_at ? new Date(row.created_at).toLocaleString('zh-CN') : '';
            tableRows += `
                <tr>
                    <td>${index + 1}</td>
                    <td>${(row.username || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
                    <td>${(row.draw_name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
                    <td>${drawTime}</td>
                </tr>
            `;
        });

        if (!tableRows) {
            tableRows = `<tr><td colspan="4">暂无抽取记录</td></tr>`;
        }

        const html = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta charset="UTF-8" />
            </head>
            <body>
                <table border="1">
                    <thead>
                        <tr>
                            <th>序号</th>
                            <th>玩家</th>
                            <th>抽取内容</th>
                            <th>抽取时间</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </body>
            </html>
        `;

        const blob = new Blob(["﻿" + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `所有玩家抽取记录_${new Date().toISOString().slice(0, 10)}.xls`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error('下载抽取记录失败:', err);
        alert('下载失败，请稍后重试。');
    } finally {
        if (downloadBtn) {
            downloadBtn.disabled = false;
            downloadBtn.innerText = '下载文档';
        }
    }
}

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
                        doubleDraw: row.used_double_draw 
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
        }

        function setupRealtime() {
            supabaseClient
                .channel('public:draw_history')
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'draw_history' }, async payload => {
                    const newRecord = payload.new;
                    historyRecords.push({ user: newRecord.username, draw: newRecord.draw_name });
                    await fetchUserBanStatus(); 
                    renderHistory();
                })
                .subscribe();
        }
		
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

            // X费之前免费（处理数据库已锁定的情况）
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

            // 一次抽两个（自由取消）
            if (activeDoubleDraw) {
                doubleDisplay.style.display = "inline-block";
                document.getElementById("btn-clear-double").style.display = "inline-block";
            } else {
                doubleDisplay.style.display = "none";
            }

            // 处理费用锁定的显示
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
                // 对于别人抽取的包含“&”的记录，我们也需要把它拆分开，使得这两个人都变成不可选
                const names = record.draw.split('&');
                if (!latestDrawsMap[record.user]) {
                    latestDrawsMap[record.user] = [];
                }
                latestDrawsMap[record.user] = names; 
            });

            const unavailableOptions = [];
            for (const user in latestDrawsMap) {
                if (user !== currentUser) { 
                    unavailableOptions.push(...latestDrawsMap[user]);
                }
            }

            // 在这里加上 opt.available !== false 的判断
            // 使用 !== false 是为了兼容如果数据库中有 null 值的历史数据也能被正常抽取
            let availableOptions = options.filter(opt => opt.available !== false && !unavailableOptions.includes(opt.name));

            if (activeBanStyle) {
                availableOptions = availableOptions.filter(opt => opt.fengge !== activeBanStyle);
            }
            if (activeBanPosition) {
                availableOptions = availableOptions.filter(opt => opt.position !== activeBanPosition);
            }

            let drawnName = "";
            const currentStatus = userBanStatusMap[currentUser] || { style: false, position: false, doubleDraw: false, freeCost: null };
            
            // 是否使用抽双重功能：仅取决于当前的UI勾选状态，不强制锁定
            const isUsingDoubleDraw = activeDoubleDraw;

            if (isUsingDoubleDraw) {
                if (availableOptions.length < 2) {
                    alert("根据当前过滤条件（或签已被抢光），没有足够的签可以同时抽取两个！");
                    document.getElementById("result").innerText = "无可用签";
                    drawBtn.disabled = false;
                    return;
                }
                // 抽第一个
                const idx1 = Math.floor(Math.random() * availableOptions.length);
                const drawnItem1 = availableOptions[idx1];
                availableOptions.splice(idx1, 1); // 从可用列表中移除已抽出的
                
                // 抽第二个
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

            const { error } = await supabaseClient
                .from('draw_history')
                .insert([{ username: currentUser, draw_name: drawnName }]);

            if (error) {
                console.error("写入抽签记录失败:", error);
                alert("网络错误，抽签结果保存失败，请重试！");
                document.getElementById("result").innerText = "等待中...";
                drawBtn.disabled = false;
                return;
            }

            const newStyle = currentStatus.style || !!activeBanStyle;
            const newPosition = currentStatus.position || !!activeBanPosition;
            // 如果玩家当前或过去曾经用过双抽，保持true，以供历史记录渲染星号使用
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
                        used_free_cost: newFreeCost 
                    }]);
                
                if (!banError) {
                    userBanStatusMap[currentUser] = { style: newStyle, position: newPosition, doubleDraw: newDoubleDraw, freeCost: newFreeCost };
                    updateBanDisplay(); 
                } else {
                    console.error("更新用户状态失败:", banError);
                }
            }

            document.getElementById("result").innerText = drawnName;
            await fetchHistory();
            drawBtn.disabled = false;
        }

		
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
                const status = userBanStatusMap[user] || { style: false, position: false, doubleDraw: false, freeCost: null };
                
                // 红色与绿色与橙黄色星号
                if (status.style) {
                    htmlContent += `<span style="color: #c62828; margin-left: 2px;">*</span>`; 
                }
                if (status.position) {
                    htmlContent += `<span style="color: #2e7d32; margin-left: 2px;">*</span>`; 
                }
                if (status.doubleDraw) {
                    htmlContent += `<span style="color: #ff9800; margin-left: 2px;">*</span>`; 
                }
                // 蓝色的数字
                if (status.freeCost) {
                    htmlContent += `<span style="color: #1565c0; font-weight: bold; margin-left: 2px;">${status.freeCost}</span>`;
                }
                
                htmlContent += "：";
                
                userSpan.innerHTML = htmlContent;
                rowDiv.appendChild(userSpan);

                const draws = userDrawsMap[user];
                
                // 记录该玩家是否已经抽到了匹配费用的签
                let freeConditionMet = false; 
                
                // 记录有效抽签数量（不带下划线的，含&也算作1次）
                let validDrawCount = 0; 

                for (let i = 0; i < draws.length; i++) {
                    const drawSpan = document.createElement("span");
                    drawSpan.innerText = draws[i];
                    drawSpan.className = "history-item ";
                    
                    if (i === draws.length - 1) {
                        drawSpan.className += "history-black";
                    } else {
                        drawSpan.className += "history-gray";
                    }

                    // 下划线判断逻辑
                    let shouldUnderline = false;
                    if (status.freeCost) {
                        // 如果条件还没满足（还没抽到过指定cost的签）
                        if (!freeConditionMet) {
                            // 将字符串按 & 切分，只要有一个满足条件，就不划线
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
                        // 如果不带下划线，则计入有效抽签总数（包含&字符串的整体也是1次循环，加1次）
                        validDrawCount++;
                    }

                    rowDiv.appendChild(drawSpan);

                    if (i < draws.length - 1) {
                        const commaNode = document.createTextNode("  ");
                        rowDiv.appendChild(commaNode);
                    }
                }

                // 计算并显示总花费
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