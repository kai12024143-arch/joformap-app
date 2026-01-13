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
    const initialPos = { lat: 35.9897, lng: 139.9791 }; 
    map = new google.maps.Map(mapElement, {
        zoom: 12,
        center: initialPos,
    });
    // 初期化後、投稿をロード
    loadPosts();
}

// ----------------------------------------------------
// 2. 位置情報を取得し、Firestoreに投稿する関数
// ----------------------------------------------------
function handlePostSubmission(event) {
    event.preventDefault(); 

    if (!postText.value.trim()) {
        alert("つぶやき内容を入力してください。");
        return;
    }

    if (isEmergencyMode) {
        const categoryElement = document.querySelector('input[name="category"]:checked');
        if (!categoryElement) {
            alert("非常時モードでは、カテゴリを選択してください。");
            return;
        }
    }

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                // 匿名化（小数点第3位まで）
                const roundedLat = Math.round(lat * 1000) / 1000;
                const roundedLng = Math.round(lng * 1000) / 1000;
                savePost(roundedLat, roundedLng);
            },
            (error) => {
                alert("位置情報エラー: " + error.message);
            }
        );
    } else {
        alert("このブラウザは位置情報に対応していません。");
    }
}

// ----------------------------------------------------
// 3. データを保存する関数（24時間削除 & 20個制限）
// ----------------------------------------------------
async function savePost(lat, lng) {
    const categoryElement = document.querySelector('input[name="category"]:checked');
    const category = isEmergencyMode && categoryElement ? categoryElement.value : "通常";
    
    // 24時間前の時刻
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const timestampThreshold = firebase.firestore.Timestamp.fromDate(twentyFourHoursAgo);

    try {
        // ① 【24時間削除】古い投稿を削除
        const oldPosts = await db.collection('posts')
            .where('timestamp', '<', timestampThreshold)
            .get();
        
        const deleteBatch = db.batch();
        oldPosts.forEach(doc => {
            deleteBatch.delete(doc.ref);
        });
        await deleteBatch.commit();

        // ② 【20個制限】同じ場所の投稿を確認
        const sameLocationPosts = await db.collection('posts')
            .where('lat', '==', lat)
            .where('lng', '==', lng)
            .orderBy('timestamp', 'asc')
            .get();

        if (sameLocationPosts.size >= 20) {
            const deleteCount = sameLocationPosts.size - 19; 
            for (let i = 0; i < deleteCount; i++) {
                await sameLocationPosts.docs[i].ref.delete();
            }
        }

        // ③ 新しい投稿を保存
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
        console.error("Error:", error);
        alert("エラーが発生しました。コンソールを確認してください。\n(Firebaseのインデックス作成が必要な場合があります)");
    }
}

// ----------------------------------------------------
// 4. 投稿を読み込む関数
// ----------------------------------------------------
function loadPosts() {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const timestampThreshold = firebase.firestore.Timestamp.fromDate(twentyFourHoursAgo);

    db.collection('posts')
        .where('timestamp', '>', timestampThreshold)
        .orderBy('timestamp', 'desc')
        .limit(50)
        .get()
        .then(snapshot => {
            // ここでは簡易的にマップ更新（本来はマーカークリアが必要ですが省略）
            snapshot.forEach(doc => {
                const data = doc.data();
                const markerColor = data.mode === 'emergency' ? 'red' : 'blue';

                const marker = new google.maps.Marker({
                    position: { lat: data.lat, lng: data.lng },
                    map: map,
                    title: data.text,
                    icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        fillColor: markerColor,
                        fillOpacity: 0.9,
                        scale: 8,
                        strokeColor: 'white',
                        strokeWeight: 2
                    }
                });

                const infoWindow = new google.maps.InfoWindow({
                    content: `<div><strong>[${data.category}]</strong><br>${data.text}</div>`
                });

                marker.addListener('click', () => {
                    infoWindow.open(map, marker);
                });
            });
        });
}

// ----------------------------------------------------
// 5. モード切替とイベント設定
// ----------------------------------------------------
modeToggle.addEventListener('click', () => {
    isEmergencyMode = !isEmergencyMode;
    
    if (isEmergencyMode) {
        modeToggle.textContent = '通常モードに戻す';
        emergencyCategories.style.display = 'flex'; // カテゴリ表示
        mapElement.style.borderColor = 'red';
        document.body.style.backgroundColor = '#fff0f0';
    } else {
        modeToggle.textContent = '非常時モードに切り替え';
        emergencyCategories.style.display = 'none'; // カテゴリ非表示
        mapElement.style.borderColor = '#333';
        document.body.style.backgroundColor = 'white';
    }
});

postForm.addEventListener('submit', handlePostSubmission);
