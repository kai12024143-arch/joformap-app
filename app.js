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
    
    // 現在時刻から24時間前を計算
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const timestampThreshold = firebase.firestore.Timestamp.fromDate(twentyFourHoursAgo);

    try {
        // ① 【24時間期限切れ削除】
        const oldPosts = await db.collection('posts')
            .where('timestamp', '<', timestampThreshold)
            .get();
        
        const deleteBatch = db.batch();
        oldPosts.forEach(doc => deleteBatch.delete(doc.ref));
        await deleteBatch.commit();

        // ② 【4個制限の処理】ここが重要です！
        // 同じ場所（lat, lng）にある投稿を古い順に取得
        const sameLocationPosts = await db.collection('posts')
            .where('lat', '==', lat)
            .where('lng', '==', lng)
            .orderBy('timestamp', 'asc')
            .get();

        // すでに4個以上あるなら、一番古いものを消して「空き」を作る
        if (sameLocationPosts.size >= 4) {
            // sizeが4なら1個、5なら2個消す（常に最新の3個を残して、今回ので4個にする）
            const deleteCount = sameLocationPosts.size - 3; 
            for (let i = 0; i < deleteCount; i++) {
                await sameLocationPosts.docs[i].ref.delete();
            }
        }

        // ③ 新しい投稿（4個目、または空きができた枠）を保存
        await db.collection('posts').add({
            text: postText.value,
            lat: lat,
            lng: lng,
            category: category,
            mode: isEmergencyMode ? 'emergency' : 'normal',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        alert("投稿しました！同じ場所で最大4個まで表示されます。");
        postText.value = ''; 
        
        // 地図上のマーカーを一度全部リセットしてから再描画
        if (typeof markers !== 'undefined') {
            markers.forEach(m => m.setMap(null));
            markers = [];
        }
        loadPosts();

    } catch (error) {
        console.error("Save Error: ", error);
        alert("エラーが発生しました。コンソール（F12）のリンクを確認してください。");
    }
}

// ----------------------------------------------------
// 4. 投稿を読み込む関数
// ----------------------------------------------------
// マーカーを管理する配列（関数の外、一番上に置いてください）
let markers = []; 

function loadPosts() {
    // ① 地図上の古いマーカーをすべて消して空にする
    markers.forEach(m => m.setMap(null));
    markers = [];

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const timestampThreshold = firebase.firestore.Timestamp.fromDate(twentyFourHoursAgo);

    db.collection('posts')
        .where('timestamp', '>', timestampThreshold)
        .orderBy('timestamp', 'desc') // 新しい順に取得
        .limit(50)
        .get()
        .then(snapshot => {
            let i = 0;
            snapshot.forEach(doc => {
                const data = doc.data();
                const markerColor = data.mode === 'emergency' ? 'red' : 'blue';

                // ② zIndex（重ね順）を設定。新しいほど数字を大きくして手前に出す
                const marker = new google.maps.Marker({
                    position: { lat: data.lat, lng: data.lng },
                    map: map,
                    zIndex: 1000 - i, // これで最新が一番上にくる
                    icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        fillColor: markerColor,
                        fillOpacity: 0.9,
                        scale: 8,
                        strokeColor: 'white',
                        strokeWeight: 2
                    }
                });

                markers.push(marker);
                i++;

                const infoWindow = new google.maps.InfoWindow({
                    content: `<div style="color:black;"><strong>[${data.category}]</strong><br>${data.text}</div>`
                });

                marker.addListener('click', () => {
                    infoWindow.open(map, marker);
                });
            });
            console.log("再読み込み完了！現在の表示件数:", markers.length);
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
