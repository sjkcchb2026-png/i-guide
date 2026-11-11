import fs from 'fs';
import path from 'path';

const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

async function testLiveFlow() {
  console.log('================================================================');
  console.log('       SISTEM KEHADIRAN SEKOLAH - 真实初始化与操作实测       ');
  console.log('================================================================\n');

  const setupToken = process.env.SETUP_TOKEN || 'Abcdefghijklmnopqrstuvwxyz123456';
  console.log(`[调试信息] 当前运行环境变量 SETUP_TOKEN: ${setupToken.substring(0, 5)}...`);

  // 1. 实际测试学校初始化
  console.log('\n--- 1. 实际调用初始化接口 (POST /api/setup/init-school) ---');
  let initSuccess = false;
  let initResult: any = null;
  try {
    const res = await fetch('http://localhost:3000/api/setup/init-school', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        setupToken: setupToken,
        schoolName: '培南国民型华文小学',
        schoolCode: 'ABC1234',
        principalName: '李校长',
        principalEmail: 'pengetua.test@moe-dl.edu.my',
        principalPassword: 'PrincipalPass2026!',
      }),
    });
    initResult = await res.json();
    console.log(`HTTP 状态码: ${res.status}`);
    console.log('响应内容:', JSON.stringify(initResult, null, 2));
    if (res.ok) {
      initSuccess = true;
    }
  } catch (err: any) {
    console.error('初始化调用网络异常:', err.message);
  }

  // 2. 实际测试校长登录 (若初始化失败或成功，通过 Firebase Client Auth 尝试登录)
  console.log('\n--- 2. 实际测试校长登录 (signInWithPassword) ---');
  let principalIdToken: string | null = null;
  try {
    const loginRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseConfig.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'pengetua.test@moe-dl.edu.my',
          password: 'PrincipalPass2026!',
          returnSecureToken: true,
        }),
      }
    );
    const loginData = await loginRes.json();
    console.log(`HTTP 状态码: ${loginRes.status}`);
    console.log('响应内容:', JSON.stringify(loginData, null, 2));
    if (loginRes.ok && loginData.idToken) {
      principalIdToken = loginData.idToken;
      console.log('✅ 校长登录成功，已获得有效 ID Token');
    }
  } catch (err: any) {
    console.error('登录测试异常:', err.message);
  }

  // 3. 实际测试建立一位测试员工 (POST /api/staff/create-single)
  console.log('\n--- 3. 实际测试建立一位测试员工 (POST /api/staff/create-single) ---');
  if (principalIdToken) {
    try {
      const createRes = await fetch('http://localhost:3000/api/staff/create-single', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${principalIdToken}`,
        },
        body: JSON.stringify({
          name: '张老师',
          email: 'cikgu.zhang@moe-dl.edu.my',
          password: 'TeacherPass2026!',
          hasClerkAccess: false,
        }),
      });
      const createData = await createRes.json();
      console.log(`HTTP 状态码: ${createRes.status}`);
      console.log('响应内容:', JSON.stringify(createData, null, 2));
    } catch (err: any) {
      console.error('建立员工异常:', err.message);
    }
  } else {
    console.log('⚠️ 由于未能获取有效校长 Token，改用未授权测试调用:');
    const createRes = await fetch('http://localhost:3000/api/staff/create-single', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid_token',
      },
      body: JSON.stringify({
        name: '张老师',
        email: 'cikgu.zhang@moe-dl.edu.my',
        password: 'TeacherPass2026!',
        hasClerkAccess: false,
      }),
    });
    console.log(`HTTP 状态码: ${createRes.status}`);
    console.log('响应内容:', await createRes.text());
  }

  // 4. 实际测试“已登录员工无法读取定位” (attendance_geo 权限测试)
  console.log('\n--- 4. 实际测试“已登录员工无法读取定位 (attendance_geo)” ---');
  console.log('说明：需要验证带有员工身份认证凭证的 Token 访问 attendance_geo 时是否被 Security Rules 拒绝');
}

testLiveFlow().catch((e) => console.error(e));
