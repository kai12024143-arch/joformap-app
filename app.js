// 1. 基本設定
const db = firebase.firestore();
const postForm = document.getElementById('post-form');
const postText = document.getElementById('post-text');
const mapElement = document.getElementById('map');
const modeToggle = document.getElementById('mode-toggle');
const emergencyCategories = document.getElementById('emergency-categories');

let map;
let isEmergencyMode = false;
let markers = []; // マーカーを管理する配列

// 2. 地図の初期化
function initMap() {
    const initialPos = { lat: 35.9897, lng: 139.9791 }; 
    map = new google.maps.Map(mapElement, {
        zoom: 12,
        center: initialPos,
    });
    loadPosts(); // 地図ができたら投稿を読み込む
}

// 3. 投稿を読み込んで「4個まで」まとめる関数
function loadPosts() {
    // 古いマーカーを消す
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

            snapshot.forEach(doc => {
                const data = doc.data();
                // 座標をキーにしてグループ化
                const posKey = `${data.lat}_${data.lng}`;
                
                if (!groupedPosts[posKey]) {
                    groupedPosts[posKey] = { lat: data.lat, lng: data.lng, mode: data.mode, contents: [] };
                }
                // 1つの場所に4つまで貯める
                if (groupedPosts[posKey].contents.length < 4) {
                    groupedPosts[posKey].contents.push({
                        text: data.text,
                        category: data.category,
                        time: data.timestamp ? new Date(data.timestamp.toDate()).toLocaleTimeString() : ''
                    });
                }
            });

            // まとめたグループごとにマーカーを作成
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

                // 吹き出しの中身を作る
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

// 4. 投稿を保存する関数（4個制限付き）
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

        // 4個以上なら古いものを消す
        if (sameLocationPosts.size >= 4) {
            const deleteCount = sameLocationPosts.size - 3; 
            for (let i = 0; i < deleteCount; i++) {
                await sameLocationPosts.docs[i].ref.delete();
            }
        }

        // 新規投稿
        await db.collection('posts').add({
            text: postText.value,
            lat: lat,
            lng: lng,
            category: category,
            mode: isEmergencyMode ? 'emergency' : 'normal',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        alert("投稿しました！クリックすると最大4件表示されます。");
        postText.value = '';
        loadPosts(); // 再描画

    } catch (error) {
        console.error("保存エラー:", error);
    }
}

// 5. 位置情報の取得とボタン設定
postForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!postText.value.trim()) return;

    navigator.geolocation.getCurrentPosition((pos) => {
        const lat = Math.round(pos.coords.latitude * 1000) / 1000;
        const lng = Math.round(pos.coords.longitude * 1000) / 1000;
        savePost(lat, lng);
    }, (err) => alert("位置情報を許可してください"));
});

modeToggle.addEventListener('click', () => {
    isEmergencyMode = !isEmergencyMode;
    modeToggle.textContent = isEmergencyMode ? '通常モードに戻す' : '非常時モードに切り替え';
    emergencyCategories.style.display = isEmergencyMode ? 'flex' : 'none';
    document.body.style.backgroundColor = isEmergencyMode ? '#fff0f0' : 'white';
});
