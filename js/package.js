// 获取当前登录用户
let currentUser = localStorage.getItem('currentUser');

// 记录已抽总数与付费包数量
let totalPackagesDrawn = 0;
let paidPackagesCount = 0; 

// 赛季数与技能池
let currentSeason = "未知赛季";
let movesDataMap = {};

// 扩展功能状态
let pkgDoubleSsrActive = false;
let pkgDoubleSsrEnded = false;

// 页面加载初始化
window.onload = async () => {
    if (!currentUser) {
        alert("请先登录！");
        window.location.href = 'index.html';
        return;
    }

    // 设置UI显示当前操作人
    document.getElementById("current-user-display").innerText = `(当前操作人: ${currentUser})`;

    // 锁定抽取按钮，防止数据没读完就点击
    const drawBtn = document.getElementById("draw-pkg-btn");
    if (drawBtn) {
        drawBtn.disabled = true;
        drawBtn.innerText = "读取历史数据中...";
    }

    // 按顺序加载各项数据
    await fetchCurrentSeason();
    await fetchMovesData();
    await fetchUserBanStatus(); // 读取扩展功能状态
    await loadPackageHistory();

    // 更新红色提示框
    updateExtDisplay(); 

    // 数据读取完毕，解锁按钮
    if (drawBtn) {
        drawBtn.disabled = false;
        drawBtn.innerText = "抽！";
    }
};

// =========================================
// 1. 扩展功能相关逻辑
// =========================================
async function fetchUserBanStatus() {
    try {
        const { data, error } = await supabaseClient
            .from('user_ban_status')
            .select('pkg_double_ssr_active, pkg_double_ssr_ended')
            .eq('username', currentUser)
            .maybeSingle();

        if (data) {
            pkgDoubleSsrActive = data.pkg_double_ssr_active || false;
            pkgDoubleSsrEnded = data.pkg_double_ssr_ended || false;
        }
    } catch (e) {
        console.error("读取扩展功能状态失败:", e);
    }
}

function showExtModal() {
    const chk = document.getElementById("chk-double-ssr");
    chk.checked = pkgDoubleSsrActive;
    
    // 如果已经开始抽了，或者该功能已经失效（双SSR已触发），则锁定复选框不可取消
    if (totalPackagesDrawn > 0 || pkgDoubleSsrEnded) {
        chk.disabled = true;
    } else {
        chk.disabled = false;
    }
    
    document.getElementById("ext-modal-overlay").style.display = "flex";
}

function hideExtModal() {
    document.getElementById("ext-modal-overlay").style.display = "none";
}

async function saveExtFeatures() {
    const chk = document.getElementById("chk-double-ssr");
    // 只有在未锁定状态下才允许保存更改
    if (!chk.disabled) {
        if (chk.checked !== pkgDoubleSsrActive) {
            pkgDoubleSsrActive = chk.checked;
            await supabaseClient.from('user_ban_status').upsert([{
                username: currentUser,
                pkg_double_ssr_active: pkgDoubleSsrActive
            }]);
        }
    }
    updateExtDisplay(); // 更新页面提示框
    hideExtModal();
}

function updateExtDisplay() {
    const displayBox = document.getElementById("ext-double-ssr-display");
    if (!displayBox) return; 
    
    if (pkgDoubleSsrActive) {
        displayBox.style.display = "inline-block";
        
        // 动态判断状态：已失效、已锁定(抽签中)、可取消
        if (pkgDoubleSsrEnded) {
            displayBox.innerHTML = '双SSR之前免费 <span style="font-size: 14px; font-weight: normal; color: #888; margin-left: 5px;">(已失效)</span>';
        } else if (totalPackagesDrawn > 0) {
            displayBox.innerHTML = '双SSR之前免费 <span style="font-size: 14px; font-weight: normal; color: #888; margin-left: 5px;">(已锁定)</span>';
        } else {
            // 还没开始抽，显示取消按钮
            displayBox.innerHTML = '双SSR之前免费 <button class="small-btn" style="padding: 2px 8px; margin-left: 10px; font-size: 14px; color: #333; border-color: #ccc; background-color: #eee;" onclick="clearExtFeature()">取消</button>';
        }
    } else {
        displayBox.style.display = "none";
    }
}

async function clearExtFeature() {
    pkgDoubleSsrActive = false;
    await supabaseClient.from('user_ban_status').upsert([{
        username: currentUser,
        pkg_double_ssr_active: false
    }]);
    updateExtDisplay();
}

// =========================================
// 2. 基础辅助数据读取与计算
// =========================================
async function fetchCurrentSeason() {
    try {
        const { data } = await supabaseClient.from('now').select('num');
        if (data && data.length > 0) currentSeason = data[0].num;
    } catch (err) {}
}

async function fetchMovesData() {
    try {
        const { data } = await supabaseClient.from('moves').select('*');
        if (data) {
            data.forEach(row => {
                const mList = [row.move1, row.move2, row.move3, row.move4, row.move5, row.move6, row.move7, row.move8, row.move9].filter(m => m);
                movesDataMap[row.category] = mList;
            });
        }
    } catch (err) {}
}

function updateTotalCostDisplay() {
    const costDisplay = document.getElementById("total-cost-display");
    if (!costDisplay) return;

    // 花费计算基于 paidPackagesCount 计算，排除掉免费包
    const n = Math.floor(paidPackagesCount / 5); 
    
    if (n > 0) {
        const totalCost = 2.5 * n * (n + 1);
        costDisplay.innerText = `[总花费：${totalCost}]`;
        costDisplay.style.display = "inline-block";
    } else {
        costDisplay.style.display = "none";
    }
}

function shuffleArray(array) {
    const newArr = [...array];
    for (let i = newArr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
    }
    return newArr;
}

// =========================================
// 3. 历史记录与抽卡核心逻辑
// =========================================
async function loadPackageHistory() {
    const container = document.getElementById("packages-container");
    const hintMsg = document.getElementById("initial-hint");

    try {
        const { data, error } = await supabaseClient
            .from('package_history')
            .select('*')
            .eq('username', currentUser)
            .order('package_index', { ascending: true }); 

        if (error) throw error;

        paidPackagesCount = 0; // 重置付费包计数

        if (data && data.length > 0) {
            if (hintMsg) hintMsg.style.display = "none";
            let htmlContent = "";
            
            data.forEach(pkg => {
                totalPackagesDrawn = Math.max(totalPackagesDrawn, pkg.package_index || 0); 
                
                // 只有不是免费的才计入花费计数器
                if (!pkg.is_free) {
                    paidPackagesCount++; 
                }
                
                const freeText = pkg.is_free ? "（免费）" : "";
                
                htmlContent += `
                    <div class="package-box">
                        <div class="package-title">${currentUser}-${pkg.season}-第${pkg.package_index}包<span style="color: #4CAF50;">${freeText}</span></div>
                        <table class="package-table">
                            <tbody>
                `;

                let itemsArray = pkg.items;
                if (typeof itemsArray === 'string') {
                    try { itemsArray = JSON.parse(itemsArray); } catch (e) { itemsArray = []; }
                }

                if (Array.isArray(itemsArray) && itemsArray.length > 0) {
                    itemsArray.forEach(item => {
                        htmlContent += `<tr><td style="width: 35%;">${item.type || '-'}</td><td style="width: 65%;">${item.content || '-'}</td></tr>`;
                    });
                }
                htmlContent += `</tbody></table></div>`;
            });

            container.innerHTML = htmlContent;
            updateTotalCostDisplay();
        }
    } catch (err) {
        console.error("读取历史记录代码异常:", err);
    }
}

async function drawPackages() {
    const drawBtn = document.getElementById("draw-pkg-btn");
    const container = document.getElementById("packages-container");
    const hintMsg = document.getElementById("initial-hint");
    
    if (hintMsg) hintMsg.style.display = "none";
    drawBtn.disabled = true;
    const originalBtnText = drawBtn.innerText;
    drawBtn.innerText = "生成并保存中...";

    try {
        const randomNums = new Set();
        while (randomNums.size < 30) {
            randomNums.add(Math.floor(Math.random() * 600) + 1);
        }
        const numList = Array.from(randomNums);

        const { data, error } = await supabaseClient
            .from('packages')
            .select('num, type, content, pick, move_JQ, move_SM, move_CQ, move_FS, move_MJ, DNFG')
            .in('num', numList);

        if (error) throw error;

        const dataMap = {};
        if (data) data.forEach(item => { dataMap[item.num] = item; });

        // === 统计这30个项目中 SSR 的数量 ===
        let ssrCount = 0;
        for (let num of numList) {
            const rowData = dataMap[num];
            if (rowData && rowData.type && rowData.type.includes('SSR')) {
                ssrCount++;
            }
        }

        // === 判断这一批(5包)是否免费 ===
        let isBatchFree = false;
        if (pkgDoubleSsrActive && !pkgDoubleSsrEnded) {
            if (ssrCount <= 1) {
                isBatchFree = true;
            } else {
                // 如果 >= 2，免费失效，永久结束此功能
                isBatchFree = false;
                pkgDoubleSsrEnded = true;
                await supabaseClient.from('user_ban_status').upsert([{
                    username: currentUser,
                    pkg_double_ssr_active: true,
                    pkg_double_ssr_ended: true
                }]);
            }
        }

        let htmlContent = "";
        let newPackagesToSave = []; 
        
        for (let i = 0; i < 5; i++) {
            totalPackagesDrawn++; 
            if (!isBatchFree) paidPackagesCount++; 
            
            let currentPackageItems = []; 
            const freeText = isBatchFree ? "（免费）" : "";
            
            htmlContent += `
                <div class="package-box">
                    <div class="package-title">${currentUser}-${currentSeason}-第${totalPackagesDrawn}包<span style="color: #4CAF50;">${freeText}</span></div>
                    <table class="package-table">
                        <tbody>
            `;

            for (let j = 0; j < 6; j++) {
                const currentNum = numList[i * 6 + j];
                const rowData = dataMap[currentNum] || { type: '缺失', content: `编号 ${currentNum} 不存在` };
                let displayContent = rowData.content; 

                // === 如果 pick 为 1，执行替换逻辑 ===
                if (rowData.pick === 1) {
                    const moveCols = ['move_JQ', 'move_SM', 'move_CQ', 'move_FS', 'move_MJ', 'DNFG'];
                    let targetCat = null, pickCount = 0;
                    for (let col of moveCols) {
                        if (rowData[col]) { targetCat = col; pickCount = rowData[col]; break; }
                    }
                    if (targetCat && pickCount > 0 && movesDataMap[targetCat]) {
                        displayContent = shuffleArray(movesDataMap[targetCat]).slice(0, pickCount).join('+');
                    }
                }

                currentPackageItems.push({ type: rowData.type, content: displayContent });
                htmlContent += `<tr><td style="width: 35%;">${rowData.type || '-'}</td><td style="width: 65%;">${displayContent || '-'}</td></tr>`;
            }

            htmlContent += `</tbody></table></div>`;

            newPackagesToSave.push({
                username: currentUser,
                season: currentSeason,
                package_index: totalPackagesDrawn,
                items: currentPackageItems,
                is_free: isBatchFree // 存入数据库标记这包是否免费
            });
        }

        // 保存到数据库
        const { error: insertError } = await supabaseClient.from('package_history').insert(newPackagesToSave);
        if (insertError) {
            totalPackagesDrawn -= 5; 
            if (!isBatchFree) paidPackagesCount -= 5;
            throw insertError;
        }

        // 追加到页面并更新 UI
        container.insertAdjacentHTML('beforeend', htmlContent);
        updateTotalCostDisplay();
        updateExtDisplay(); 

    } catch (err) {
        console.error("生成或保存失败:", err);
        alert("操作失败！可能是网络或数据库配置错误。");
    } finally {
        drawBtn.disabled = false;
        drawBtn.innerText = originalBtnText;
    }
}