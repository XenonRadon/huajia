// 获取当前登录用户
let currentUser = localStorage.getItem('currentUser');

// 记录已抽总数与付费包数量
let totalPackagesDrawn = 0;
let paidPackagesCount = 0; 

// 赛季数与技能池
let currentSeason = "未知赛季";
let movesDataMap = {};

// === 新增：用于存储原始数据库记录，供导出 Excel 使用 ===
let globalPackageHistory = []; 

// 页面加载初始化
window.onload = async () => {
    if (!currentUser) {
        alert("请先登录！");
        window.location.href = 'index.html';
        return;
    }

    // 设置UI显示当前操作人
    document.getElementById("current-user-display").innerText = `(当前操作人: ${currentUser})`;

    // OB 视角专属 UI 处理
    if (currentUser === 'OB') {
        const drawControls = document.getElementById("draw-pkg-btn")?.parentElement;
        if (drawControls) drawControls.style.display = "none"; // 隐藏抽卡和扩展功能按钮
        
        const extDisplayArea = document.getElementById("ext-display-area");
        if (extDisplayArea) extDisplayArea.style.display = "none"; // 隐藏下方的红色提示框
        
        const hintMsg = document.getElementById("initial-hint");
        if (hintMsg) {
            hintMsg.innerText = "【OB】正在查看所有用户的培养包记录";
            hintMsg.style.color = "#1976d2";
            hintMsg.style.fontWeight = "bold";
        }

        // 显示下载 Excel 按钮
        const downloadBtn = document.getElementById("download-excel-btn");
        if (downloadBtn) downloadBtn.style.display = "inline-block";
        
    } else {
        // 普通用户锁定抽取按钮，防止数据没读完就点击
        const drawBtn = document.getElementById("draw-pkg-btn");
        if (drawBtn) {
            drawBtn.disabled = true;
            drawBtn.innerText = "读取历史数据中...";
        }
    }

    // 按顺序加载各项数据
    await fetchCurrentSeason();
    await fetchMovesData();
    if (currentUser !== 'OB') {
        await fetchUserBanStatus(); 
    }
    await loadPackageHistory();

    // 更新红色提示框
    if (currentUser !== 'OB') {
        updateExtDisplay(); 
        
        // 数据读取完毕，解锁按钮
        const drawBtn = document.getElementById("draw-pkg-btn");
        if (drawBtn) {
            drawBtn.disabled = false;
            drawBtn.innerText = "抽！";
        }
    }
};

// =========================================
// 1. 扩展功能相关逻辑
// =========================================
let pkgGuaranteedSsrActive = false;

async function fetchUserBanStatus() {
    try {
        const { data, error } = await supabaseClient
            .from('user_ban_status')
            .select('pkg_guaranteed_ssr_active')
            .eq('username', currentUser)
            .maybeSingle();

        if (data) {
            pkgGuaranteedSsrActive = data.pkg_guaranteed_ssr_active || false;
        }
    } catch (e) {
        console.error("读取扩展功能状态失败:", e);
    }
}

function showExtModal() {
    const chk = document.getElementById("chk-guaranteed-ssr");
    chk.checked = pkgGuaranteedSsrActive;
    
    // 如果已经抽过（不论抽了几包），该选项即被锁定
    if (totalPackagesDrawn > 0) {
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
    const chk = document.getElementById("chk-guaranteed-ssr");
    if (!chk.disabled) {
        if (chk.checked !== pkgGuaranteedSsrActive) {
            pkgGuaranteedSsrActive = chk.checked;
            await supabaseClient.from('user_ban_status').upsert([{
                username: currentUser,
                pkg_guaranteed_ssr_active: pkgGuaranteedSsrActive
            }]);
        }
    }
    updateExtDisplay(); 
    hideExtModal();
}

function updateExtDisplay() {
    const displayBox = document.getElementById("ext-guaranteed-ssr-display");
    if (!displayBox) return; 
    
    if (pkgGuaranteedSsrActive) {
        displayBox.style.display = "inline-block";
        
        if (totalPackagesDrawn > 0) {
            displayBox.innerHTML = '首抽必定4个SSR <span style="font-size: 14px; font-weight: normal; color: #888; margin-left: 5px;">(已生效)</span>';
        } else {
            displayBox.innerHTML = '首抽必定4个SSR <button class="small-btn" style="padding: 2px 8px; margin-left: 10px; font-size: 14px; color: #333; border-color: #ccc; background-color: #eee;" onclick="clearExtFeature()">取消</button>';
        }
    } else {
        displayBox.style.display = "none";
    }
}

async function clearExtFeature() {
    pkgGuaranteedSsrActive = false;
    await supabaseClient.from('user_ban_status').upsert([{
        username: currentUser,
        pkg_guaranteed_ssr_active: false
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

    try {
        let query = supabaseClient.from('package_history').select('*');
        if (currentUser === 'OB') {
            query = query.order('username', { ascending: true }).order('id', { ascending: true }); 
        } else {
            query = query.eq('username', currentUser).order('package_index', { ascending: true });
        }

        const { data, error } = await query;

        if (error) {
            alert("读取数据失败！请检查数据库配置。\n错误原因：" + error.message);
            throw error;
        }

        globalPackageHistory = data || [];
        paidPackagesCount = 0; 

        if (data && data.length > 0) {
            let htmlContent = "";
            
            data.forEach(pkg => {
                if (currentUser !== 'OB') {
                    totalPackagesDrawn = Math.max(totalPackagesDrawn, pkg.package_index || 0); 
                    paidPackagesCount++; // 移除了is_free的判断，现在所有包都计费
                }
                
                // 动态显示增强包标签
                let tagText = pkg.is_enhanced ? "（增强）" : "";
                const displayUser = pkg.username || currentUser;
                
                htmlContent += `
                    <div class="package-box">
                        <div class="package-title">${displayUser}-${pkg.season}-第${pkg.package_index}包<span style="color: #4CAF50;">${tagText}</span></div>
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
            if (currentUser !== 'OB') updateTotalCostDisplay();
            
        } else if (currentUser === 'OB') {
            container.innerHTML = "<div style='color: #666; font-size: 18px; margin-top: 30px;'>当前数据库中没有任何用户的培养包记录。</div>";
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
    drawBtn.innerText = "生成并结算中...";

    try {
        // 先读取全库的类型，用于内存中高速重抽结算
        const { data: allPkgs, error: allErr } = await supabaseClient.from('packages').select('num, type');
        if (allErr) throw allErr;
        const typeMap = {};
        allPkgs.forEach(p => typeMap[p.num] = p.type);

        let isEnhanced = false;
        // 只有开启了扩展功能，并且是前 5 包（当前0包）时，才触发必定4个SSR
        if (pkgGuaranteedSsrActive && totalPackagesDrawn === 0) {
            isEnhanced = true;
        }

        let numList = [];
        let loopSafety = 0;
        
        // 在内存中不断生成 30 个随机数，直到满足条件
        while (loopSafety < 5000) {
            loopSafety++;
            const randomNums = new Set();
            while (randomNums.size < 30) {
                randomNums.add(Math.floor(Math.random() * 600) + 1);
            }
            numList = Array.from(randomNums);

            if (isEnhanced) {
                let ssrCount = 0;
                for (let num of numList) {
                    if (typeMap[num] && typeMap[num].includes('SSR')) {
                        ssrCount++;
                    }
                }
                // 满足4个SSR即生效退出重抽
                if (ssrCount >= 4) break; 
            } else {
                break; 
            }
        }

        if (loopSafety >= 5000) {
            throw new Error("卡池异常，无法抽出符合条件的包，请检查配置。");
        }

        // 仅抓取这最终确定的 30 个包的详细信息
        const { data, error } = await supabaseClient
            .from('packages')
            .select('num, type, content, pick, move_JQ, move_SM, move_CQ, move_FS, move_MJ, DNFG')
            .in('num', numList);

        if (error) throw error;

        const dataMap = {};
        if (data) data.forEach(item => { dataMap[item.num] = item; });

        let htmlContent = "";
        let newPackagesToSave = []; 
        
        for (let i = 0; i < 5; i++) {
            totalPackagesDrawn++; 
            paidPackagesCount++; 
            
            let currentPackageItems = []; 
            const tagText = isEnhanced ? "（增强）" : "";
            
            htmlContent += `
                <div class="package-box">
                    <div class="package-title">${currentUser}-${currentSeason}-第${totalPackagesDrawn}包<span style="color: #4CAF50;">${tagText}</span></div>
                    <table class="package-table">
                        <tbody>
            `;

            for (let j = 0; j < 6; j++) {
                const currentNum = numList[i * 6 + j];
                const rowData = dataMap[currentNum] || { type: '缺失', content: `编号 ${currentNum} 不存在` };
                let displayContent = rowData.content; 

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

            const itemsStr = currentPackageItems.map(i => `${i.type || ''}:${i.content || ''}`).join('|');
            const contentStr = `${currentSeason}_${totalPackagesDrawn}_${itemsStr}`;
            const sign = generateSignature(currentUser, contentStr);

            // 2. 把签名放进即将保存的数据字典里
            newPackagesToSave.push({
                username: currentUser,
                season: currentSeason,
                package_index: totalPackagesDrawn,
                items: currentPackageItems,
                is_enhanced: isEnhanced,
                sys_sign: sign   // <==== 加上这一行！
            });
        }

        const { error: insertError } = await supabaseClient.from('package_history').insert(newPackagesToSave);
        if (insertError) {
            totalPackagesDrawn -= 5; 
            paidPackagesCount -= 5;
            throw insertError;
        }

        container.insertAdjacentHTML('beforeend', htmlContent);
        updateTotalCostDisplay();
        updateExtDisplay(); 

    } catch (err) {
        console.error("生成或保存失败:", err);
        alert("操作失败！可能是网络或数据库配置错误。详细信息：" + err.message);
    } finally {
        drawBtn.disabled = false;
        drawBtn.innerText = originalBtnText;
    }
}

// =========================================
// 4. 导出 Excel 逻辑 (定制化格式)
// =========================================
function exportToExcel() {
    if (!globalPackageHistory || globalPackageHistory.length === 0) {
        alert("当前没有可下载的数据！");
        return;
    }

    try {
        // 1. 将数据按用户归类
        const userMap = {};
        globalPackageHistory.forEach(pkg => {
            const user = pkg.username || '未知用户';
            if (!userMap[user]) userMap[user] = [];

            let itemsArray = pkg.items;
            if (typeof itemsArray === 'string') {
                try { itemsArray = JSON.parse(itemsArray); } catch (e) { itemsArray = []; }
            }
            userMap[user].push(itemsArray);
        });

        const users = Object.keys(userMap); // 获取所有有记录的用户名

        // 2. 构建二维数组 (AoA)，每个用户占据并排的 2 列
        const aoa = [];
        
        // --- 第1行：写入所有用户的名字（在每个用户的第1列） ---
        const headerRow = [];
        users.forEach(user => {
            headerRow.push(user); // 每人的左列写名字
            headerRow.push("");   // 每人的右列留空
        });
        aoa.push(headerRow);

        // 获取历史记录中最多的包数量，确定向下要循环几次
        let maxPackages = 0;
        users.forEach(user => {
            if (userMap[user].length > maxPackages) {
                maxPackages = userMap[user].length;
            }
        });

        // --- 从第2行起：逐包输出，每包 6 行，包之间空 1 行 ---
        for (let pIdx = 0; pIdx < maxPackages; pIdx++) {
            
            // 每一个包固定产生 6 行记录
            for (let i = 0; i < 6; i++) {
                const row = [];
                users.forEach(user => {
                    const pkgs = userMap[user];
                    // 检查该用户是否有第 pIdx 个包，以及包里是否有第 i 行数据
                    if (pIdx < pkgs.length && pkgs[pIdx][i]) {
                        row.push(pkgs[pIdx][i].type || "-");
                        row.push(pkgs[pIdx][i].content || "-");
                    } else {
                        // 如果用户这包没抽或者数据缺失，补全 2 个空白列，对齐格式
                        row.push("");
                        row.push("");
                    }
                });
                aoa.push(row);
            }
            
            // 每输出完一包，如果还不是最后一包，则额外增加一个空行
            if (pIdx < maxPackages - 1) {
                const emptyRow = new Array(users.length * 2).fill("");
                aoa.push(emptyRow);
            }
        }

        // 3. 将二维数组转换为工作表
        const worksheet = XLSX.utils.aoa_to_sheet(aoa);
        
        // 4. 创建工作簿并触发下载
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "培养包记录");
        
        const fileName = `${currentSeason}_所有用户培养包记录.xlsx`;
        XLSX.writeFile(workbook, fileName);

    } catch (error) {
        console.error("导出 Excel 失败:", error);
        alert("导出失败，请检查浏览器是否拦截了下载！");
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