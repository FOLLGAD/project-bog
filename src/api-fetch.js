const env = require('../env.json')
const { synth, foulSpanDictionary } = require('./synth')
const { launchComment, launchQuestion } = require('./puppet')
const { createVideo, combineVideos } = require('./video')

const fetch = require('node-fetch')
const timeAgo = require('node-time-ago')

let access_token

async function getAuth() {
    let response = await fetch('https://www.reddit.com/api/v1/access_token?grant_type=client_credentials', {
        headers: {
            'Authorization': `Basic ${env.Authorization}`, // Use Basic authentication
        },
        method: 'POST',
    })
        .then(res => res.json())
        .catch(console.error)
    return response.access_token
}

async function updateAuth() {
    access_token = await getAuth()
}

async function fetchComments(articleId) {
    return await fetch('https://oauth.reddit.com/r/AskReddit/comments/' + articleId, {
        headers: {
            Authorization: `Bearer ${access_token}`,
        },
    })
        .catch(console.error)
        .then(r => r.json())
}

async function renderCommentImgs(commentData, name) {
    let upvoted = Math.random() > 0.9 // 10% of the posts will randomly be seen as upvoted

    let items = {
        username: commentData.author,
        score: commentData.score,
        time: timeAgo(commentData.created_utc * 1000), // Timezones are unimportant
        edited: commentData.edited ? timeAgo(commentData.edited * 1000) : null,
        upvoted,

        silvers: commentData.gildings.gid_1,
        golds: commentData.gildings.gid_2,
        platina: commentData.gildings.gid_3,
    }

    items.score = formatNum(items.score)

    let bod = commentData.body.trim()
    let paragraphs = bod.trim().split('\n').filter(d => d.length !== 0)

    let ps = paragraphs.map(block => {
        let reg = /(,|\.|\?|!)+( |\n)+/g
        let array = []
        let result
        let lastIndex = 0
        let to, from
        while ((result = reg.exec(block)) != null) {
            from = lastIndex
            to = result.index + result[0].length
            lastIndex = to
            array.push(block.slice(from, to))
        }
        array.push(block.slice(to))

        return array
    })

    let totalSections = ps.map(d => d.length).reduce((a, b) => a + b, 0)

    let vids = []

    for (let i = 0; i < totalSections; i++) {
        let counter = 0
        let tts = ""

        let h = ps.map(p => {
            return p.map(str => {
                if (counter == i) {
                    tts = str
                }
                for (key in foulSpanDictionary) {
                    str = str.replace(new RegExp(key, 'gi'), foulSpanDictionary[key])
                }
                if (counter++ > i) {
                    return hideSpan(str)
                } else {
                    return str
                }
            })
        })

        let imgPromise = launchComment({ ...items, showBottom: i == totalSections - 1, body_html: h.map(m => '<p>' + m.join('') + '</p>').join('').replace('*', '') })
        let audioPromise = synth(name + '-' + i + '.mp3', tts)
        v = makeVideo(imgPromise, audioPromise, name + '-' + i)
        vids.push(v)
    }

    await Promise.all(vids).then(names => {
        combineVideos(names, name)
    })
}

function renderQuestion(questionData) {
    let items = {
        username: questionData.author,
        score: formatNum(questionData.score),
        time: timeAgo(questionData.created_utc * 1000), // Timezones are unimportant
        comments: formatNum(questionData.num_comments),

        body_html: questionData.title,

        silvers: questionData.gildings.gid_1,
        golds: questionData.gildings.gid_2,
        platina: questionData.gildings.gid_3,
    }
    let body = items.body_html

    let reg = /(,|\.|\?|!)+( |\n)+/g
    let array = []
    let result
    let lastIndex = 0
    let to, from
    while ((result = reg.exec(body)) != null) {
        from = lastIndex
        to = result.index + result[0].length
        lastIndex = to
        array.push(body.slice(from, to))
    }
    array.push(body.slice(to))

    let vids = []

    let name = 'Q'

    for (let i = 0; i < array.length; i++) {
        let counter = 0
        let tts = ""

        let h = array.map(str => {
            if (counter == i) {
                tts = str
            }
            for (key in foulSpanDictionary) {
                str = str.replace(new RegExp(key, 'gi'), foulSpanDictionary[key])
            }
            if (counter++ > i) {
                return hideSpan(str)
            } else {
                return str
            }
        })

        let instanceName = name + '-' + i

        let imgPromise = launchQuestion({ ...items, body_html: h.join("") })
        let audioPromise = synth(instanceName + '.mp3', tts)

        let v = Promise.all([imgPromise, audioPromise])
            .then(([img, audio]) => {
                return createVideo(instanceName, img, audio)
            })
        vids.push(v)
    }

    return Promise.all(vids)
        .then(videos => combineVideos(videos, name))
}

function hideSpan(str) {
    return '<span class="invis">' + str + '</span>'
}

function formatNum(num) {
    let d = parseInt(num)
    if (num >= 1000) {
        return Math.round(num / 100) / 10 + 'k'
    }
    return d
}

setInterval(updateAuth, 55 * 60 * 1000) // Update every 55 minutes (expires in 60 minutes)

async function main() {
    console.log("Started BOG")
    await updateAuth()
    console.log("AUTH completed")

    let thread = process.argv[2]
    if (!thread) throw new Error("Must enter a thread ID")
    console.log("Fetching from thread", thread)

    let [question, comments] = await fetchComments(thread.trim())
        .then(r => (console.log('Fetched comments!'), r))
        .then(r => [r[0].data.children[0].data, r[1].data.children.slice(0, 0)])

    await renderQuestion(question)

    for (let i = 0; i < comments.length; i++) {
        await renderCommentImgs(comments[i].data, i)
        console.log("Rendered", i)
    }

    console.log("Finished!")

    process.exit(0)
}

main()