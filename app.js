// Firestoreインスタンスの取得
const db = firebase.firestore();

// HTML要素の取得
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
    event.preventDefault(); // フォームの送信を停止

    if (!postText.value.trim()) {
        alert("つぶやき内容を入力してください。");
        return;
    }

    // 非常時モードのカテゴリ選択チェック
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
                // 匿名化処理（小数点第3位まで丸める）
                const roundedLat = Math.round(lat * 1000) / 1000;
                const roundedLng = Math.round(lng * 1000) / 1000;
                savePost(roundedLat, roundedLng);
            },
            (error) => {
                let errorMessage = '位置情報が取得できませんでした。';
                switch(error.code) {
                    case error.PERMISSION_DENIED:
                        errorMessage += "位置情報の利用が許可されていません。設定を確認してください。";
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errorMessage += "位置情報が利用できません。";
                        break;
                    case error.TIMEOUT:
                        errorMessage += "タイムアウトしました。";
                        break;
                    default:
                        errorMessage += "不明なエラーが発生しました。";
                        break;
                }
                alert("投稿失敗: " + errorMessage);
                console.error("Geolocation Error: ", error);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    } else {
        alert("お使いのブラウザは位置情報取得に対応していません。");
    }
}

// ----------------------------------------------------
// 3. データをFirestoreに保存する関数（24時間削除 & 20個制限）
// ----------------------------------------------------
async function savePost(lat, lng) {
    const categoryElement = document.querySelector('input[name="category"]:checked');
    const category = isEmergencyMode && categoryElement ? categoryElement.value : "通常";
    
    // 現在時刻から24時間前を計算
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const timestampThreshold = firebase.firestore.Timestamp.fromDate(twentyFourHoursAgo);

    try {
        // ① 【24時間期限切れ削除】全投稿の中から24時間以上前のものを探して削除
        const oldPosts = await db.collection('posts')
            .where('timestamp', '<', timestampThreshold)
            .get();
        
        // 古い投稿をまとめて削除
        const deleteBatch = db.batch();
        oldPosts.forEach(doc => {
            deleteBatch.delete(doc.ref);
        });
        await deleteBatch.commit();
        if(oldPosts.size > 0) console.log(`${oldPosts.size}件の古い投稿を削除しました。`);

        // ② 【20個制限削除】同じ座標にある投稿を確認
        const sameLocationPosts = await db.collection('posts')
            .where('lat', '==', lat)
            .where('lng', '==', lng)
            .orderBy('timestamp', 'asc')
            .get();

        if (sameLocationPosts.size >= 20) {
            // 20個以上ある場合、古い順に消して枠を空ける
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

        alert("投稿が完了しました！");
        postText.value = ''; // 入力欄クリア
        
        // モードリセットなどが不要ならそのまま
        // 再読み込み
        loadPosts();

    } catch (error) {
        console.error("Save/Delete Error: ", error);
        alert("エラーが発生しました。コンソールを確認してください。\n(初めての実装の場合、Firebaseコンソールでインデックス作成が必要です)");
    }
}

// ----------------------------------------------------
// 4. Firestoreから投稿を読み込み、マップに表示する関数
// ----------------------------------------------------
function loadPosts() {
    // 24時間前の時刻を計算
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const timestampThreshold = firebase.firestore.Timestamp.fromDate(twentyFourHoursAgo);

    // 24時間以内の投稿だけを取得
    db.collection('posts')
        .where('timestamp', '>', timestampThreshold)
        .orderBy('timestamp', 'desc')
        .limit(50)
        .get()
        .then(snapshot => {
            // マップ上の既存マーカーを消す処理を入れるのが理想ですが、
            // 簡易的にここでは上書き追加していきます（リロードでクリアされます）
            
            snapshot.forEach(doc => {
                const data = doc.data();
                const markerColor = data.mode === 'emergency' ? 'red' : 'blue';

                // マーカー作成
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

                // 情報ウィンドウ
                const infoWindow = new google.maps.InfoWindow({
                    content: `
                        <div style="padding:5px; color:black;">
                            <strong>[${data.category}]</strong><br>
                            ${data.text}<br>
                            <small style="color:gray;">
                                ${data.timestamp ? new Date(data.timestamp.toDate()).toLocaleString() : '日時不明'}
                            </small>
                        </div>
                    `
                });

                marker.addListener('click', () => {
                    infoWindow.open(map, marker);
                });
            });
        })
        .catch(err => {
            console.error("読み込みエラー: ", err);
            // インデックスエラーの場合、コンソールにリンクが出ます
        });
}

// ----------------------------------------------------
// 5. モード切り替え機能
// ----------------------------------------------------
if (modeToggle) {
    modeToggle.addEventListener('click', () => {
        isEmergencyMode = !isEmergencyMode; // モード反転
        
        if (isEmergencyMode) {
            modeToggle.textContent = '通常モードに戻す';
            modeToggle.style.backgroundColor = '#ff4444'; // ボタンを赤く
            modeToggle.style.color = 'white';
            
            emergencyCategories.style.display = 'flex'; // カテゴリ表示
            mapElement.style.borderColor = 'red';
            document.body.style.backgroundColor = '#fff0f0'; // 背景を薄い赤に
        } else {
            modeToggle.textContent = '非常時モードに切り替え';
            modeToggle.style.backgroundColor = ''; // 色リセット
            modeToggle.style.color = '';

            emergencyCategories.style.display = 'none'; // カテゴリ非表示
            mapElement.style.borderColor = '#333';
            document.body.style.backgroundColor = 'white';
        }
    });
}

// ----------------------------------------------------
// 6. イベントリスナーの設定
// ----------------------------------------------------
if (postForm) {
    postForm.addEventListener('submit', handlePostSubmission);
}
