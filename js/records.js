// 全局变量保存当前赛季
let currentSeason = "未知赛季";

window.onload = async () => {
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) {
        alert("请先登录！");
        window.location.href = 'index.html';
        return;
    }

    // 1. 先读取当前赛季数
    await fetchCurrentSeason();
    
    // 2. 更新页面标题
    const titleElement = document.getElementById("page-title");
    if (titleElement) {
        titleElement.innerText = `${currentSeason}-花费汇总`;
    }

    // 3. 开始加载所有花费记录
    await loadAllRecords();
};

// --- 新增：从 now 数据库获取赛季数 ---
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

async function loadAllRecords() {
    try {
        // ================= 1. 读取所有的必须数据 =================
        // 读取培养包记录
        const { data: pkgData, error: pkgError } = await supabaseClient
            .from('package_history')
            .select('username, package_index, is_free');
        if (pkgError) throw pkgError;

        // 读取外籍抽签记录（按时间严格排序，否则免费判定会算错）
        const { data: drawData, error: drawError } = await supabaseClient
            .from('draw_history')
            .select('username, draw_name')
            .order('created_at', { ascending: true });
        if (drawError) throw drawError;

        // 读取外籍抽签池（为了拿到 cost 来算下划线）
        const { data: poolData, error: poolError } = await supabaseClient
            .from('characters_pool')
            .select('name, cost');
        if (poolError) throw poolError;

        // 读取用户外籍 BAN 状态（找 freeCost）
        const { data: banData, error: banError } = await supabaseClient
            .from('user_ban_status')
            .select('username, used_free_cost');
        if (banError) throw banError;


        // ================= 2. 计算【培养包花费】 =================
        const packageCosts = {};
        if (pkgData) {
            const paidPkgCountMap = {};
            // 统计每个用户【非免费】的包的数量
            pkgData.forEach(row => {
                if (!row.is_free) {
                    paidPkgCountMap[row.username] = (paidPkgCountMap[row.username] || 0) + 1;
                }
            });
            // 计算花费：2.5 * N * (N + 1)，N 是付费包除以 5
            for (const user in paidPkgCountMap) {
                const n = Math.floor(paidPkgCountMap[user] / 5);
                packageCosts[user] = n > 0 ? (2.5 * n * (n + 1)) : 0;
            }
        }


        // ================= 3. 计算【外籍花费】 =================
        const drawCosts = {};
        if (drawData) {
            // 将签池映射为 名字->花费 的字典
            const charCostMap = {};
            if (poolData) {
                poolData.forEach(char => {
                    charCostMap[char.name] = String(char.cost);
                });
            }

            // 将用户状态映射为 用户->freeCost 的字典
            const userFreeCostMap = {};
            if (banData) {
                banData.forEach(ban => {
                    userFreeCostMap[ban.username] = ban.used_free_cost ? String(ban.used_free_cost) : null;
                });
            }

            // 按用户将抽签记录分组
            const userDrawsMap = {};
            drawData.forEach(row => {
                if (!userDrawsMap[row.username]) {
                    userDrawsMap[row.username] = [];
                }
                userDrawsMap[row.username].push(row.draw_name);
            });

            // 还原 draw.js 里的计算算法
            for (const user in userDrawsMap) {
                const draws = userDrawsMap[user];
                const freeCost = userFreeCostMap[user];
                let freeConditionMet = false;
                let validDrawCount = 0;

                for (let i = 0; i < draws.length; i++) {
                    let shouldUnderline = false;
                    
                    if (freeCost) {
                        if (!freeConditionMet) {
                            const singleNames = draws[i].split('&');
                            let hasMatchingCost = false;
                            
                            for (const sName of singleNames) {
                                if (charCostMap[sName] === freeCost) {
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

                    if (!shouldUnderline) {
                        validDrawCount++;
                    }
                }
                // 套用原公式
                drawCosts[user] = Math.pow(2, validDrawCount + 1) - 2;
            }
        }


        // ================= 4. 合并与渲染 =================
        // 获取所有出现过的用户 (Set去重)
        const allUsers = new Set([...Object.keys(packageCosts), ...Object.keys(drawCosts)]);
        const records = [];

        allUsers.forEach(user => {
            const pCost = packageCosts[user] || 0;
            const dCost = drawCosts[user] || 0;
            records.push({
                username: user,
                pkgCost: pCost,
                drawCost: dCost,
                total: pCost + dCost
            });
        });

        // 按用户名拼音或字母顺序排列
        records.sort((a, b) => a.username.localeCompare(b.username, 'zh-CN'));

        // 生成 HTML 并推入表格
        const tbody = document.getElementById("records-tbody");
        let htmlContent = "";
        
        if (records.length === 0) {
            htmlContent = `<tr><td colspan="4">暂无任何花费记录</td></tr>`;
        } else {
            records.forEach(r => {
                htmlContent += `
                    <tr>
                        <td>${r.username}</td>
                        <td>${r.pkgCost}</td>
                        <td>${r.drawCost}</td>
                        <td class="cost-total">${r.total}</td>
                    </tr>
                `;
            });
        }

        tbody.innerHTML = htmlContent;
        
        // 隐藏加载提示，显示表格
        document.getElementById("loading-text").style.display = "none";
        document.getElementById("records-table").style.display = "table";

    } catch (error) {
        console.error("加载记录失败:", error);
        document.getElementById("loading-text").innerText = "加载数据失败，请检查网络或配置。";
        document.getElementById("loading-text").style.color = "red";
    }
}