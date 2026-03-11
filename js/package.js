// 获取当前登录用户
let currentUser = localStorage.getItem('currentUser');

// 记录当前用户已经抽取的培养包总数
let totalPackagesDrawn = 0;

// 当前赛季数
let currentSeason = "未知赛季";

// 存放 moves 数据库的映射表
let movesDataMap = {};

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

    // 按顺序获取当前赛季数、moves 技能池，最后加载历史记录
    await fetchCurrentSeason();
    await fetchMovesData();
    await loadPackageHistory();

    // 数据读取完毕，解锁按钮
    if (drawBtn) {
        drawBtn.disabled = false;
        drawBtn.innerText = "抽！";
    }
};

// 从 now 数据库获取赛季数
async function fetchCurrentSeason() {
    try {
        const { data, error } = await supabaseClient
            .from('now')
            .select('num');

        if (error) {
            console.error("读取赛季数失败:", error);
        } else if (data && data.length > 0) {
            currentSeason = data[0].num;
        }
    } catch (err) {
        console.error("获取赛季异常:", err);
    }
}

// 从 moves 表读取技能池并整理为字典
async function fetchMovesData() {
    try {
        const { data, error } = await supabaseClient
            .from('moves')
            .select('*');

        if (error) {
            console.error("读取 moves 数据库失败:", error);
        } else if (data) {
            data.forEach(row => {
                const mList = [
                    row.move1, row.move2, row.move3, 
                    row.move4, row.move5, row.move6, 
                    row.move7, row.move8, row.move9
                ].filter(m => m);
                
                movesDataMap[row.category] = mList;
            });
        }
    } catch (err) {
        console.error("获取 moves 异常:", err);
    }
}

// 计算并更新总花费显示
function updateTotalCostDisplay() {
    const costDisplay = document.getElementById("total-cost-display");
    const n = Math.floor(totalPackagesDrawn / 5); 
    
    if (n > 0) {
        const totalCost = 2.5 * n * (n + 1);
        costDisplay.innerText = `[总花费：${totalCost}]`;
        costDisplay.style.display = "inline-block";
    } else {
        costDisplay.style.display = "none";
    }
}

// 读取当前用户的历史培养包记录
async function loadPackageHistory() {
    const container = document.getElementById("packages-container");
    const hintMsg = document.getElementById("initial-hint");

    try {
        const { data, error } = await supabaseClient
            .from('package_history')
            .select('*')
            .eq('username', currentUser)
            .order('package_index', { ascending: true }); 

        if (error) {
            alert("读取历史记录失败！请检查 Supabase 权限(如 RLS 是否关闭)。\n错误信息：" + error.message);
            throw error;
        }

        if (data && data.length > 0) {
            if (hintMsg) hintMsg.style.display = "none";
            
            let htmlContent = "";
            
            data.forEach(pkg => {
                // 取已有记录里最大的序号，安全防呆设计
                totalPackagesDrawn = Math.max(totalPackagesDrawn, pkg.package_index || 0); 
                
                htmlContent += `
                    <div class="package-box">
                        <div class="package-title">${currentUser}-${pkg.season}-第${pkg.package_index}包</div>
                        <table class="package-table">
                            <tbody>
                `;

                // 【核心修复】兼容处理：如果数据库把 JSON 存成了文本字符串，手动帮它转换回来防止崩溃
                let itemsArray = pkg.items;
                if (typeof itemsArray === 'string') {
                    try {
                        itemsArray = JSON.parse(itemsArray);
                    } catch (e) {
                        itemsArray = [];
                    }
                }

                if (Array.isArray(itemsArray) && itemsArray.length > 0) {
                    itemsArray.forEach(item => {
                        htmlContent += `
                                <tr>
                                    <td style="width: 35%;">${item.type || '-'}</td>
                                    <td style="width: 65%;">${item.content || '-'}</td>
                                </tr>
                        `;
                    });
                }

                htmlContent += `
                            </tbody>
                        </table>
                    </div>
                `;
            });

            container.innerHTML = htmlContent;
            updateTotalCostDisplay();
        }
    } catch (err) {
        console.error("读取历史记录代码异常:", err);
    }
}

// 数组随机打乱（Fisher-Yates 算法）
function shuffleArray(array) {
    const newArr = [...array];
    for (let i = newArr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
    }
    return newArr;
}

// 点击抽取培养包
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
        if (data) {
            data.forEach(item => {
                dataMap[item.num] = item;
            });
        }

        let htmlContent = "";
        let newPackagesToSave = []; 
        
        for (let i = 0; i < 5; i++) {
            totalPackagesDrawn++; 
            
            let currentPackageItems = []; 
            
            htmlContent += `
                <div class="package-box">
                    <div class="package-title">${currentUser}-${currentSeason}-第${totalPackagesDrawn}包</div>
                    <table class="package-table">
                        <tbody>
            `;

            for (let j = 0; j < 6; j++) {
                const currentNum = numList[i * 6 + j];
                const rowData = dataMap[currentNum] || { type: '缺失', content: `编号 ${currentNum} 不存在` };

                let displayContent = rowData.content; 

                if (rowData.pick === 1) {
                    const moveCols = ['move_JQ', 'move_SM', 'move_CQ', 'move_FS', 'move_MJ', 'DNFG'];
                    let targetCat = null;
                    let pickCount = 0;
                    
                    for (let col of moveCols) {
                        if (rowData[col] !== null && rowData[col] !== undefined && rowData[col] !== 0) {
                            targetCat = col;
                            pickCount = rowData[col];
                            break;
                        }
                    }

                    if (targetCat && pickCount > 0 && movesDataMap[targetCat]) {
                        const availableMoves = movesDataMap[targetCat];
                        const shuffled = shuffleArray(availableMoves);
                        const selectedMoves = shuffled.slice(0, pickCount);
                        displayContent = selectedMoves.join('+');
                    }
                }

                currentPackageItems.push({
                    type: rowData.type,
                    content: displayContent
                });

                htmlContent += `
                            <tr>
                                <td style="width: 35%;">${rowData.type || '-'}</td>
                                <td style="width: 65%;">${displayContent || '-'}</td>
                            </tr>
                `;
            }

            htmlContent += `
                        </tbody>
                    </table>
                </div>
            `;

            newPackagesToSave.push({
                username: currentUser,
                season: currentSeason,
                package_index: totalPackagesDrawn,
                items: currentPackageItems
            });
        }

        const { error: insertError } = await supabaseClient
            .from('package_history')
            .insert(newPackagesToSave);

        if (insertError) {
            totalPackagesDrawn -= 5; 
            alert("保存到数据库失败！可能是权限不足。\n错误：" + insertError.message);
            throw insertError;
        }

        container.insertAdjacentHTML('beforeend', htmlContent);
        updateTotalCostDisplay();

    } catch (err) {
        console.error("生成或保存失败:", err);
    } finally {
        drawBtn.disabled = false;
        drawBtn.innerText = originalBtnText;
    }
}