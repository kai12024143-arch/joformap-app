// index.htmlで初期化されたFirebaseサービスを取得
const auth = firebase.auth();
const db = firebase.firestore();

// ページロード時に匿名ログインを実行
window.onload = () => {
    auth.signInAnonymously()
        .then(() => console.log("匿名ログイン成功！"))
        .catch(error => console.error("ログイン失敗:", error));
};
function getCurrentLocation() {
    return new Promise((resolve, reject) => {
        if (navigator.geolocation) {
            // 成功したら緯度経度を返す
            navigator.geolocation.getCurrentPosition(
                (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
                // 拒否されたらエラーを返す（投稿を拒否するため）
                (error) => reject("投稿には位置情報の提供が必須です。設定を確認してください。"),
                { enableHighAccuracy: true, timeout: 5000 }
            );
        } else {
            reject("お使いのブラウザは位置情報に対応していません。");
        }
    });
}
document.getElementById('post-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!auth.currentUser) return alert("ログイン処理が未完了です。");

    try {
        const location = await getCurrentLocation(); // 位置情報取得
        
        await db.collection('posts').add({
            userId: auth.currentUser.uid,
            text: document.getElementById('post-text').value,
            location: location,
            category: isEmergencyMode ? document.querySelector('input[name="category"]:checked')?.value : '通常',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert('投稿完了！');
    } catch (error) {
        alert("投稿失敗: " + error);
    }
});
let map;

function initMap() {
    map = new google.maps.Map(document.getElementById('map'), {
        zoom: 12,
        center: { lat: 36.05, lng: 139.99 } // 常総市の中心付近
    });
    
    // Firestoreの投稿をリアルタイムで監視し、地図にマーカーを追加
    db.collection('posts').onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
            const data = change.doc.data();
            if (change.type === 'added' && data.location) {
                new google.maps.Marker({
                    position: data.location,
                    map: map,
                    title: data.text,
                    // カテゴリに応じたアイコンや色を設定するロジックをここに追加
                });
            }
        });
    });
}
