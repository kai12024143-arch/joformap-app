// Firestoreインスタンスの取得
const db = firebase.firestore();
const postForm = document.getElementById('post-form');
const postText = document.getElementById('post-text');
const mapElement = document.getElementById('map');
const modeToggle = document.getElementById('mode-toggle');
const emergencyCategories = document.getElementById('emergency-categories');

let map;
let isEmergencyMode = false;

// ----------------------------------------------------
// 1. Google Mapの初期化関数
// ----------------------------------------------------
function initMap() {
    // 地図の中心を常総市役所付近に設定
    const initialPos = { lat: 35.9897, lng: 139.9791 }; 
    map = new google.maps.Map(mapElement, {
        zoom: 12,
        center: initialPos,
    });
    // 初期化後、既存の投稿をロードする
    loadPosts();
}

// ----------------------------------------------------
// 2. 位置情報を取得し、Firestoreに投稿する関数
// ----------------------------------------------------
function handlePostSubmission(event) {
    event.preventDefault(); // フォームの送信を停止（最初に実行）

    if (!postText.value.trim()) {
        alert("つぶやき内容を入力してください。");
        return;
    }

    // ⭐ 非常時モードのカテゴリ選択チェック
    if (isEmergencyMode) {
        const categoryElement = document.querySelector('input[name="category"]:checked');
        if (!categoryElement) {
            alert("非常時モードでは、安否、被害、支援要請のいずれかを選択してください。");
            return;
        }
    }

    // ジオロケーションAPIで現在地を取得
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                // 匿名化処理
                const roundedLat = Math.round(lat * 1000) / 1000;
                const roundedLng = Math.round(lng * 1000) / 1000;
                savePost(roundedLat, roundedLng);
            },
            (error) => {
            let errorMessage = '位置情報が取得できませんでした。';
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMessage += "ブラウザで位置情報へのアクセスが拒否されています。設定を確認してください。";
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMessage += "位置情報が利用できません。";
                    break;
                case error.TIMEOUT:
                    errorMessage += "位置情報の取得がタイムアウトしました。";
                    break;
                case error.UNKNOWN_ERROR:
                    errorMessage += "不明なエラーが発生しました。";
                    break;
            }
            alert("投稿失敗: " + errorMessage);
            console.error("Geolocation Error: ", error);
        },
        {
            // ... (オプション設定は省略)
        }
    );
} else {
    alert("お使いのブラウザは位置情報取得に対応していません。");
}
// ----------------------------------------------------
// 3. データをFirestoreに保存する関数（20個制限ルール付き）
// ----------------------------------------------------
async function savePost(lat, lng) {
    const categoryElement = document.querySelector('input[name="category"]:checked');
    const category = isEmergencyMode && categoryElement ? categoryElement.value : "通常";

    try {
        // ① 同じ座標（lat, lng）にある投稿を古い順に取得
        const sameLocationPosts = await db.collection('posts')
            .where('lat', '==', lat)
            .where('lng', '==', lng)
            .orderBy('timestamp', 'asc') // 古い順
            .get();

        // ② もし既に20個（またはそれ以上）あれば、古いものを削除
        // 新しい1件を追加するので、19個以下になるまで消す
        if (sameLocationPosts.size >= 20) {
            const deleteCount = sameLocationPosts.size - 19; 
            for (let i = 0; i < deleteCount; i++) {
                await sameLocationPosts.docs[i].ref.delete();
                console.log("古い投稿を制限（20個）のため削除しました。");
            }
        }

        // ③ 新しい投稿を保存
        await db.collection('posts').add({
            text: postText.value,
            lat: lat,
            lng: lng,
            category: category,
            mode: isEmergencyMode ? 'emergency' : 'normal',
            timestamp: firebase.firestore.Timestamp.now() // 即時スタンプ
        });

        alert("投稿が完了しました！");
        postText.value = ''; // テキストエリアをクリア
        loadPosts(); // マップを更新

    } catch (error) {
        alert("エラーが発生しました。Firebaseのインデックス作成が必要かもしれません。: " + error.message);
        console.error("Save/Delete Error: ", error);
    }
}
// ----------------------------------------------------
// 4. Firestoreから投稿を読み込み、マップに表示する関数
// ----------------------------------------------------
function loadPosts() {
    db.collection('posts').orderBy('timestamp', 'desc').limit(50).get().then(snapshot => {
        // マーカーをクリアする処理（省略）
        snapshot.forEach(doc => {
            const data = doc.data();
            const markerColor = data.mode === 'emergency' ? 'red' : 'blue';

            // マーカーを地図に追加
            const marker = new google.maps.Marker({
                position: { lat: data.lat, lng: data.lng },
                map: map,
                title: data.text,
                icon: {
                    // カテゴリに応じて色やアイコンを変えることも可能
                    path: google.maps.SymbolPath.CIRCLE,
                    fillColor: markerColor,
                    fillOpacity: 0.9,
                    scale: 7,
                    strokeColor: 'white',
                    strokeWeight: 1
                }
            });

            // 情報ウィンドウ（ポップアップ）の設定
            const infoWindow = new google.maps.InfoWindow({
                content: `
                    <div>
                        <strong>カテゴリー:</strong> ${data.category}<br>
                        <strong>つぶやき:</strong> ${data.text}<br>
                        <em>(${new Date(data.timestamp.toDate()).toLocaleTimeString()})</em>
                    </div>
                `
            });

            marker.addListener('click', () => {
                infoWindow.open(map, marker);
            });
        });
    });
}


// ----------------------------------------------------
// 5. モード切り替え機能
// ----------------------------------------------------
modeToggle.addEventListener('click', () => {
    isEmergencyMode = !isEmergencyMode; // モードを反転
    
    if (isEmergencyMode) {
        modeToggle.textContent = '通常モードに戻す';
        // ⭐ ここを 'flex' に統一 ⭐
        emergencyCategories.style.display = 'flex'; 
        mapElement.style.borderColor = 'red';
        document.body.style.backgroundColor = '#fdd';
    } else {
        modeToggle.textContent = '非常時モードに切り替え';
        emergencyCategories.style.display = 'none'; // カテゴリを非表示
        mapElement.style.borderColor = 'black';
        document.body.style.backgroundColor = 'white';
    }
});
    
// ----------------------------------------------------
// 6. イベントリスナーの設定
// ----------------------------------------------------
if (postForm) { // フォーム要素が存在するか確認
    postForm.addEventListener('submit', handlePostSubmission);
}
// ⭐ modeToggleのイベントリスナーもここに記述する ⭐
if (modeToggle) {
    modeToggle.addEventListener('click', () => {
        isEmergencyMode = !isEmergencyMode; // モードを反転
        
        if (isEmergencyMode) {
            modeToggle.textContent = '通常モードに戻す';
            emergencyCategories.style.display = 'flex'; // flexに変更
            document.body.style.backgroundColor = '#fdd';
        } else {
            modeToggle.textContent = '非常時モードに切り替え';
            emergencyCategories.style.display = 'none';
            document.body.style.backgroundColor = 'white';
        }
    });
}
