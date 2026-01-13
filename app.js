// ==========================================
// 1. Firebaseの設定（あなたのプロジェクト用）
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyBMOr6Kag-PCGL6piRVtjCDukk01aurb1M",
    authDomain: "joso-13c95.firebaseapp.com",
    projectId: "joso-13c95",
    storageBucket: "joso-13c95.firebasestorage.app",
    messagingSenderId: "659788884587",
    appId: "1:659788884587:web:39b9a1b840039c24875f2e"
};

// まだ初期化されていなければ初期化する
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// ==========================================
// 2. HTML要素の取得
// ==========================================
const postForm = document.getElementById('post-form');
const postText = document.getElementById('post-text');
const mapElement = document.getElementById('map');
const modeToggle = document.getElementById('mode-toggle');
const emergencyCategories = document.getElementById('emergency-categories');

let map;
let isEmergencyMode = false;
let markers = [];

// ==========================================
// 3. 地図の読み込み（最重要：エラーの元を確実に定義）
// ==========================================
window.initMap = function() {
    const initialPos = { lat: 35.9897, lng: 139.9791 }; 
    map = new google.maps.Map(mapElement, {
        zoom: 12,
        center: initialPos,
    });
    // loadPostsを確実に呼ぶ
    if (typeof loadPosts === 'function') {
        loadPosts();
    }
};

// ==========================================
// 4. 投稿を読み込んで「4個まで」まとめる関数
// ==========================================
function loadPosts() {
    console.log("データの読み込みを開始します...");
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
                const posKey = `${data.lat}_${data.lng}`;
                if (!groupedPosts[posKey]) {
                    groupedPosts[posKey] = { lat: data.lat, lng: data.lng, mode: data.mode, contents: [] };
                }
                if (groupedPosts[posKey].contents.length < 4) {
                    groupedPosts[posKey].contents.push({
                        text: data.text,
                        category: data.category,
                        time: data.timestamp ? new Date(data.timestamp.toDate()).toLocaleTimeString() : ''
                    });
                }
            });

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

                const html = group.contents.map(c => 
                    `<div style="border-bottom:1px solid #eee; padding:5px; color:black; min-width:150px;">
                        <b>[${c.category}]</b> <small>${c.time}</small><br>${c.text}
                    </div>`
                ).join('');

                const infoWindow = new google.maps.InfoWindow({ content: html });
                marker.addListener('click', () => infoWindow.open(map, marker));
                markers.push(marker);
            });
            console.log("読み込み完了！現在のピン数:", Object.keys(groupedPosts).length);
        })
        .catch(err => console.error("Firestoreエラー:", err));
}

// ==========================================
// 5. 投稿の保存
// ==========================================
async function savePost(lat, lng) {
    const categoryElement = document.querySelector('input[name="category"]:checked');
    const category = isEmergencyMode && categoryElement ? categoryElement.value : "通常";

    try {
        const sameLocationPosts = await db.collection('posts')
            .where('lat', '==', lat)
            .where('lng', '==', lng)
            .orderBy('timestamp', 'asc')
            .get();

        if (sameLocationPosts.size >= 4) {
            const deleteCount = sameLocationPosts.size - 3; 
            for (let i = 0; i < deleteCount; i++) {
                await sameLocationPosts.docs[i].ref.delete();
            }
        }

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
        loadPosts();

    } catch (error) {
        console.error("保存失敗:", error);
        alert("インデックス作成が必要です。コンソールのリンクをクリックしてください。");
    }
}

// ==========================================
// 6. イベント設定
// ==========================================
if (postForm) {
    postForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!postText.value.trim()) return;

        navigator.geolocation.getCurrentPosition((pos) => {
            const lat = Math.round(pos.coords.latitude * 1000) / 1000;
            const lng = Math.round(pos.coords.longitude * 1000) / 1000;
            savePost(lat, lng);
        }, (err) => alert("位置情報をオンにしてください"));
    });
}

if (modeToggle) {
    modeToggle.addEventListener('click', () => {
        isEmergencyMode = !isEmergencyMode;
        modeToggle.textContent = isEmergencyMode ? '通常モードに戻す' : '非常時モードに切り替え';
        emergencyCategories.style.display = isEmergencyMode ? 'flex' : 'none';
        document.body.style.backgroundColor = isEmergencyMode ? '#fff0f0' : 'white';
    });
}
