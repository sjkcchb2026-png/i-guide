import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

async function testAccess() {
  console.log('--- Testing target 1: gen-lang-client-0796671896 / ai-studio-2b763e92-60bd-4b23-9079-2cba85c09a65 ---');
  try {
    const appCore = initializeApp({ projectId: 'gen-lang-client-0796671896' }, 'coreApp');
    const dbCore = getFirestore(appCore, 'ai-studio-2b763e92-60bd-4b23-9079-2cba85c09a65');
    const snap = await dbCore.collection('personnel').get();
    console.log('Core personnel collection size:', snap.size);
    const snapT = await dbCore.collection('teachers').get();
    console.log('Core teachers collection size:', snapT.size);
  } catch (e: any) {
    console.error('Core error:', e.message);
  }

  console.log('\n--- Testing target 2: gen-lang-client-0384285333 / ai-studio-9da55e18-8b12-4090-9356-16a74f3c27e2 ---');
  try {
    const appAtt = initializeApp({ projectId: 'gen-lang-client-0384285333' }, 'attApp');
    const dbAtt = getFirestore(appAtt, 'ai-studio-9da55e18-8b12-4090-9356-16a74f3c27e2');
    const snap = await dbAtt.collection('personnel').get();
    console.log('Attendance personnel collection size:', snap.size);
    const snapT = await dbAtt.collection('teachers').get();
    console.log('Attendance teachers collection size:', snapT.size);
  } catch (e: any) {
    console.error('Attendance error:', e.message);
  }
}

testAccess();
