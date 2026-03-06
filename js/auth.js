// 检查回车键
function checkEnter(event) {
    if (event.key === "Enter") {
        login();
    }
}

// 登录逻辑
async function login() {
    const inputUser = document.getElementById("username-input").value.trim();
    const inputPwd = document.getElementById("password-input").value.trim();
    
    if (!inputUser) {
        alert("用户名不能为空，请输入您的用户名！");
        return;
    }

    const loginBtn = document.getElementById("login-btn");
    const statusDiv = document.getElementById("system-status");
    
    loginBtn.disabled = true;
    statusDiv.innerText = "正在验证登录信息...";

    // 假设 supabaseClient 已经在 js/supabase-init.js 中初始化
    const { data, error } = await supabaseClient
        .from('user_passwords')
        .select('password')
        .eq('username', inputUser)
        .maybeSingle();

    loginBtn.disabled = false;
    statusDiv.innerText = "";

    if (error) {
        console.error("验证密码失败:", error);
        alert("网络错误或密码表未配置，请稍后重试！");
        return;
    }

    let hasPassword = false;
    if (data) {
        if (data.password !== inputPwd) {
            alert("密码错误，请重新输入！");
            return;
        }
        hasPassword = true;
    }

    // 关键：将状态保存到浏览器的 localStorage 中
    localStorage.setItem('currentUser', inputUser);
    localStorage.setItem('hasPassword', hasPassword.toString());

    // 登录成功，跳转到主菜单
    window.location.href = 'menu.html';
}

// 退出登录逻辑
function logout() {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('hasPassword');
    window.location.href = 'index.html';
}