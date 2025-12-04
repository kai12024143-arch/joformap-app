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
    event.preventDefault(); // フォームの送信を一旦停止

    if (!postText.value.trim()) {
        alert("つぶやき内容を入力してください。");
        return;
    }

    // ⭐ 修正追加: 非常時モードでカテゴリ選択を強制する
    if (isEmergencyMode) {
        const categoryElement = document.querySelector('input[name="category"]:checked');
        if (!categoryElement) {
            alert("非常時モードでは、安否、被害、支援要請のいずれかを選択してください。");
            return; // 選択されていない場合は処理を中断
        }
    }
    
    // ... ジオロケーションAPIで現在地を取得する処理へ続く
    event.preventDefault(); // フォームの送信を一旦停止

    if (!postText.value.trim()) {
        alert("つぶやき内容を入力してください。");
        return;
    }

    // ジオロケーションAPIで現在地を取得
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                // 取得成功時の処理
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;

                // ⭐ 匿名化処理: 座標を丸める (例: 100m四方に丸める)
                // 整数 x 100000 = 約 1.1メートル単位
                const roundedLat = Math.round(lat * 1000) / 1000;
                const roundedLng = Math.round(lng * 1000) / 1000;

                savePost(roundedLat, roundedLng);
            },
            (error) => {
                // ⭐ エラー処理: 位置情報取得失敗時の詳細なメッセージ
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
                // ⭐ オプション設定: タイムアウトと精度を確保
                enableHighAccuracy: true, // 高精度な取得を試みる
                timeout: 5000,           // 5秒でタイムアウトさせる
                maximumAge: 0            // キャッシュされた古い情報は使わない
            }
        );
    } else {
        alert("お使いのブラウザは位置情報取得に対応していません。");
    }
}

// ----------------------------------------------------
// 3. データをFirestoreに保存する関数
// ----------------------------------------------------
function savePost(lat, lng) {
    const categoryElement = document.querySelector('input[name="category"]:checked');
    const category = isEmergencyMode && categoryElement ? categoryElement.value : "通常";

    db.collection('posts').add({
        text: postText.value,
        lat: lat,
        lng: lng,
        category: category,
        mode: isEmergencyMode ? 'emergency' : 'normal',
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(() => {
        alert("投稿が完了しました！");
        postText.value = ''; // テキストエリアをクリア
        // 投稿完了後にマップを再描画（またはリアルタイムリスナーが反応）
        loadPosts();
    })
    .catch((error) => {
        alert("データベースへの書き込み中にエラーが発生しました: " + error.message);
        console.error("Firestore Write Error: ", error);
    });
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
        emergencyCategories.style.display = 'block'; // カテゴリを表示
        mapElement.style.borderColor = 'red'; // 緊急性を視覚的に伝える
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
postForm.addEventListener('submit', handlePostSubmission);
