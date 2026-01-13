// ==========================================
// 1. 基本設定と変数
// ==========================================
const db = firebase.firestore();
const postForm = document.getElementById('post-form');
const postText = document.getElementById('post-text');
const mapElement = document.getElementById('map');
const modeToggle = document.getElementById('mode-toggle');
const emergencyCategories = document.getElementById('emergency-categories');

let map;
let isEmergencyMode = false;
let markers = []; // 地図上のマーカーを管理

// ==========================================
// 2. 地図の初期化 (Google Mapsが呼ぶ)
// ==========================================
function initMap() {
    const initialPos = { lat: 35.9897, lng: 139.9791 }; // 常総市付近
    map = new google.maps.Map(mapElement, {
        zoom: 12,
        center: initialPos,
    });
    // 地図ができたら投稿を読み込む
    loadPosts();
}

// ==========================================
// 3. 投稿を読み込んで表示する (これがエラーの原因でした)
// ==========================================
function loadPosts() {
    // 古いマーカーを全部消す
    markers.forEach(m => m.setMap(null));
    markers = [];

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const timestampThreshold = firebase.firestore.Timestamp.fromDate(twentyFourHoursAgo);

    db.collection('posts')
        .where('timestamp', '>', timestampThreshold)
        .orderBy('timestamp', 'desc')
        .get()
        .then(snapshot => {
            const groupedPosts = {};

            // 座標ごとに投稿をまとめる
            snapshot.forEach(doc => {
                const data = doc.data();
                const posKey = `${data.lat}_${data.lng}`;
                
                if (!groupedPosts[posKey]) {
                    groupedPosts[posKey] = { 
                        lat: data.lat, 
                        lng: data.lng, 
                        mode: data.mode, 
                        contents: [] 
                    };
                }
                // 1つの場所に最大4件まで貯める
                if (groupedPosts[posKey].contents.length < 4) {
                    groupedPosts[posKey].contents.push({
                        text: data.text,
                        category: data.category,
                        time: data.timestamp ? new Date(data.timestamp.toDate()).toLocaleTimeString() : ''
                    });
                }
            });

            // まとめたグループをマーカーとして地図に置く
            Object.values(groupedPosts).forEach(group => {
                const marker = new google.maps.Marker({
                    position: { lat: group.lat, lng: group.lng },
                    map: map,
                    icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        fillColor: group.mode === 'emergency' ? 'red' : 'blue',
                        fillOpacity: 0.8,
                        scale: 10,
                        strokeColor: 'white',
                        strokeWeight: 2
                    }
                });

                // 吹き出し（インフォウィンドウ）の中身を作成
                const html = group.contents.map(c => 
                    `<div style="border-bottom:1px solid #eee; padding:5px; color:black; min-width:150px;">
                        <b>[${c.category}]</b> <small>${c.time}</small><br>${c.text}
                    </div>`
                ).join('');

                const infoWindow = new google.maps.InfoWindow({ content: html });
                marker.addListener('click', () => infoWindow.open(map, marker));
                markers.push(marker);
            });
            console.log("読み込み完了！");
        })
        .catch(err => console.error("読み込みエラー:", err));
}

// ==========================================
// 4. 投稿を保存する (4個制限)
// ==========================================
async function savePost(lat, lng) {
    const categoryElement = document.querySelector('input[name="category"]:checked');
    const category = isEmergencyMode && categoryElement ? categoryElement.value : "通常";

    try {
        // 同じ場所の投稿をチェック
        const sameLocationPosts = await db.collection('posts')
            .where('lat', '==', lat)
            .where('lng', '==', lng)
            .orderBy('timestamp', 'asc')
            .get();

        // 4個以上なら古い順に消す
        if (sameLocationPosts.size >= 4) {
            const deleteCount = sameLocationPosts.size - 3; 
            for (let i = 0; i < deleteCount; i++) {
                await sameLocationPosts.docs[i].ref.delete();
            }
        }

        // 新しく保存
        await db.collection('posts').add({
            text: postText.value,
            lat: lat,
            lng: lng,
            category: category,
            mode: isEmergencyMode ? 'emergency' : 'normal',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        alert("投稿しました！");
        postText.value = '';
        loadPosts(); // 地図を更新

    } catch (error) {
        console.error("保存失敗:", error);
        alert("エラー：Firebaseのインデックス作成が必要かもしれません。コンソールを確認してください。");
    }
}

// ==========================================
// 5. イベント設定
// ==========================================
postForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!postText.value.trim()) return;

    navigator.geolocation.getCurrentPosition((pos) => {
        // 座標を少し丸める（約100m範囲でまとめるため）
        const lat = Math.round(pos.coords.latitude * 1000) / 1000;
        const lng = Math.round(pos.coords.longitude * 1000) / 1000;
        savePost(lat, lng);
    }, (err) => alert("位置情報をオンにしてください"));
});

modeToggle.addEventListener('click', () => {
    isEmergencyMode = !isEmergencyMode;
    modeToggle.textContent = isEmergencyMode ? '通常モードに戻す' : '非常時モードに切り替え';
    emergencyCategories.style.display = isEmergencyMode ? 'flex' : 'none';
    document.body.style.backgroundColor = isEmergencyMode ? '#fff0f0' : 'white';
});
