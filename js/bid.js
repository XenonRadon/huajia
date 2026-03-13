let currentUser = localStorage.getItem('currentUser');
let allBidsData = []; // 用于保存全局加载的暗标数据，供结算使用

window.onload = async () => {
    if (!currentUser) {
        alert("请先登录！");
        window.location.href = 'index.html';
        return;
    }

    document.getElementById("current-user-display").innerText = `(当前操作人: ${currentUser})`;

    if (currentUser === 'bidGM') {
        // bidGM 视角：隐藏填报区域，显示数据与结算表格区域
        document.getElementById("user-view").style.display = "none";
        document.getElementById("ob-view").style.display = "block";
        await loadAllBids();
    } else if (currentUser === 'OB') {
        // OB 视角：什么都不显示，并给出一句提示
        document.getElementById("user-view").style.display = "none";
        document.getElementById("ob-view").style.display = "none";
        
        const hintDiv = document.createElement("div");
        hintDiv.style.marginTop = "60px";
        hintDiv.style.fontSize = "20px";
        hintDiv.style.color = "#888";
        hintDiv.style.fontWeight = "bold";
        hintDiv.innerText = "【OB】用户无法参与暗标，且无权查看暗标详情（结算权限仅限 bidGM 账号）。";
        document.getElementById("user-view").parentNode.appendChild(hintDiv);
    } else {
        // 普通用户视角：显示填报区域，读取历史填报记录
        document.getElementById("user-view").style.display = "block";
        document.getElementById("ob-view").style.display = "none";
        await loadUserBid();
    }
};

// ==========================================
// 普通用户功能：加载自己已提交的暗标
// ==========================================
async function loadUserBid() {
    try {
        const { data, error } = await supabaseClient
            .from('blind_bids')
            .select('*')
            .eq('username', currentUser)
            .maybeSingle();

        if (error) throw error;

        if (data) {
            document.getElementById("choice-1").value = data.choice_1;
            document.getElementById("bid-1").value = data.bid_1;
            document.getElementById("choice-2").value = data.choice_2;
            document.getElementById("bid-2").value = data.bid_2;
            document.getElementById("choice-3").value = data.choice_3;
            document.getElementById("bid-3").value = data.bid_3;

            const submitBtn = document.getElementById("submit-btn");
            submitBtn.innerText = "修改暗标";
            document.getElementById("status-msg").innerText = "已加载您之前的出价记录。";
            document.getElementById("status-msg").style.color = "#2e7d32";
        }
    } catch (err) {
        console.error("加载个人暗标失败:", err);
    }
}

// ==========================================
// 普通用户功能：提交/修改暗标
// ==========================================
async function submitBid() {
    const c1 = document.getElementById("choice-1").value;
    const b1 = document.getElementById("bid-1").value.trim();
    const c2 = document.getElementById("choice-2").value;
    const b2 = document.getElementById("bid-2").value.trim();
    const c3 = document.getElementById("choice-3").value;
    const b3 = document.getElementById("bid-3").value.trim();

    if (!c1 || !c2 || !c3 || b1 === "" || b2 === "" || b3 === "") {
        alert("请完整选择三个志愿并填写对应的出价！");
        return;
    }

    const choiceSet = new Set([c1, c2, c3]);
    if (choiceSet.size !== 3) {
        alert("第一、二、三志愿不能有重复选项，请重新选择！");
        return;
    }

    const numB1 = Number(b1);
    const numB2 = Number(b2);
    const numB3 = Number(b3);
    
    if (!Number.isInteger(numB1) || !Number.isInteger(numB2) || !Number.isInteger(numB3)) {
        alert("出价必须是整数！");
        return;
    }

    const submitBtn = document.getElementById("submit-btn");
    const msgDiv = document.getElementById("status-msg");
    
    submitBtn.disabled = true;
    submitBtn.innerText = "提交中...";
    msgDiv.innerText = "";

    try {
        const payload = {
            username: currentUser,
            choice_1: c1, bid_1: numB1,
            choice_2: c2, bid_2: numB2,
            choice_3: c3, bid_3: numB3,
            updated_at: new Date().toISOString()
        };

        const { error } = await supabaseClient.from('blind_bids').upsert([payload]);
        if (error) throw error;

        msgDiv.innerText = "提交成功！您可以随时返回修改。";
        msgDiv.style.color = "#2e7d32";
        submitBtn.innerText = "修改暗标";

    } catch (err) {
        console.error("提交暗标失败:", err);
        msgDiv.innerText = "提交失败，请检查网络！";
        msgDiv.style.color = "#d32f2f";
        submitBtn.innerText = "重新提交";
    } finally {
        submitBtn.disabled = false;
    }
}

// ==========================================
// GM 功能：加载所有人暗标数据
// ==========================================
async function loadAllBids() {
    const tbody = document.getElementById("ob-tbody");
    tbody.innerHTML = "<tr><td colspan='5'>加载中...</td></tr>";

    try {
        const { data, error } = await supabaseClient
            .from('blind_bids')
            .select('*')
            .order('updated_at', { ascending: false });

        if (error) throw error;

        allBidsData = data || []; // 保存到全局供结算使用

        if (allBidsData.length > 0) {
            let html = "";
            allBidsData.forEach(row => {
                const dateObj = new Date(row.updated_at);
                const timeStr = dateObj.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

                html += `
                    <tr>
                        <td style="font-weight: bold;">${row.username}</td>
                        <td>${row.choice_1} <span style="color: #d32f2f; font-weight:bold;">(${row.bid_1})</span></td>
                        <td>${row.choice_2} <span style="color: #ff9800; font-weight:bold;">(${row.bid_2})</span></td>
                        <td>${row.choice_3} <span style="color: #388e3c; font-weight:bold;">(${row.bid_3})</span></td>
                        <td style="font-size: 14px; color: #666;">${timeStr}</td>
                    </tr>
                `;
            });
            tbody.innerHTML = html;
        } else {
            tbody.innerHTML = "<tr><td colspan='5'>暂无任何人提交暗标</td></tr>";
        }
    } catch (err) {
        console.error("GM加载数据失败:", err);
        tbody.innerHTML = "<tr><td colspan='5' style='color: red;'>加载数据失败，请检查数据库权限或配置。</td></tr>";
    }
}

// ==========================================
// GM 功能：结算暗标核心逻辑
// ==========================================
function settleBids() {
    if (allBidsData.length === 0) {
        alert("当前没有任何人提交暗标，无法结算！");
        return;
    }

    // 1. 初始化录取名额与容器
    const MAX_QUOTA = 8;
    const results = {
        'A': [],
        'B': [],
        'C': []
    };
    
    // 记录已经被录取的用户名单，避免重复录取
    const admittedUsers = new Set();

    // 2. 核心结算逻辑：分三个轮次进行处理
    for (let round = 1; round <= 3; round++) {
        // 当前轮次中，选择报考A、B、C的候选人名单
        const candidates = { 'A': [], 'B': [], 'C': [] };

        allBidsData.forEach(bid => {
            // 如果该用户已经被录取，直接跳过
            if (admittedUsers.has(bid.username)) return;

            let currentChoice, currentBid;
            if (round === 1) { currentChoice = bid.choice_1; currentBid = bid.bid_1; }
            if (round === 2) { currentChoice = bid.choice_2; currentBid = bid.bid_2; }
            if (round === 3) { currentChoice = bid.choice_3; currentBid = bid.bid_3; }

            candidates[currentChoice].push({
                username: bid.username,
                bid: currentBid,
                round: round,
                updated_at: bid.updated_at
            });
        });

        // 针对每个选项，对候选人按出价和时间进行排序，并填充剩余名额
        ['A', 'B', 'C'].forEach(item => {
            candidates[item].sort((a, b) => {
                if (b.bid !== a.bid) {
                    // 1. 首要条件：出价高的优先（降序）
                    return b.bid - a.bid;
                } else {
                    // 2. 次要条件：出价相同，提交时间早的优先（升序）
                    const timeA = new Date(a.updated_at).getTime();
                    const timeB = new Date(b.updated_at).getTime();
                    return timeA - timeB; 
                }
            });

            // 检查当前选项还能录取多少人
            const remainingSpots = MAX_QUOTA - results[item].length;
            if (remainingSpots > 0) {
                // 取出前 N 名，加入录取名单
                const admittedThisRound = candidates[item].slice(0, remainingSpots);
                admittedThisRound.forEach(user => {
                    results[item].push(user);
                    admittedUsers.add(user.username);
                });
            }
        });
    }

    // 3. 渲染结果到弹窗
    ['A', 'B', 'C'].forEach(item => {
        const td = document.getElementById(`result-${item}`);
        if (results[item].length === 0) {
            td.innerHTML = "<span style='color: #999;'>暂无录取</span>";
            return;
        }

        let html = "";
        results[item].forEach(user => {
            html += `<div class="admit-item round-${user.round}">
                        <strong>${user.username}</strong> 
                        <span style="color: #666; font-size: 14px; margin-left: 5px;">(出价: ${user.bid})</span>
                     </div>`;
        });
        
        const emptySpots = MAX_QUOTA - results[item].length;
        for (let i = 0; i < emptySpots; i++) {
            html += `<div class="admit-item" style="background: transparent; border: 1px dashed #ccc; color: #aaa;">空位</div>`;
        }
        
        td.innerHTML = html;
    });

    // 4. 寻找落榜用户
    const unadmittedList = allBidsData.filter(bid => !admittedUsers.has(bid.username)).map(b => b.username);
    const unadmittedContainer = document.getElementById("unadmitted-container");
    if (unadmittedList.length > 0) {
        unadmittedContainer.style.display = "block";
        document.getElementById("unadmitted-users").innerText = unadmittedList.join("、");
    } else {
        unadmittedContainer.style.display = "none";
    }

    // 5. 显示大弹窗
    document.getElementById("settle-modal-overlay").style.display = "flex";
}

function closeSettleModal() {
    document.getElementById("settle-modal-overlay").style.display = "none";
}