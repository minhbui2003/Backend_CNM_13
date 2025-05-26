const uploadDefaultAvatar = (lastName) => {
    //lấy chữ cái đầu tiên của lastName
    const firstLetter = lastName.charAt(0).toUpperCase()

    switch (firstLetter) {
        case 'A':
            return 'https://res.cloudinary.com/dpj4kdkxj/image/upload/v1712052200/Avatar/jyq7dlnk1ujptecdlcgl.png'
        case 'B':
            return 'https://res.cloudinary.com/dpj4kdkxj/image/upload/v1712052200/Avatar/rjbhkekayoccoqmjf646.png'
        case 'C':
            return 'https://res.cloudinary.com/dpj4kdkxj/image/upload/v1712052200/Avatar/kyvfpp1goia9lzy47oxi.png'
        case 'D':
            return 'https://res.cloudinary.com/dpj4kdkxj/image/upload/v1712052201/Avatar/imjis8bgd43alteekzbp.png'
        case 'E':
            return 'https://res.cloudinary.com/dpj4kdkxj/image/upload/v1712052200/Avatar/bpg8qxqjznuxlbjaxbtx.png'
        case 'F':
            return 'https://res.cloudinary.com/dpj4kdkxj/image/upload/v1712052201/Avatar/bobjtv8mrviahdln0szc.png'
        case 'G':
            return 'https://res.cloudinary.com/dpj4kdkxj/image/upload/v1712052201/Avatar/v06aoes4lofjyuj71kmy.png'
        case 'H':
            return 'https://res.cloudinary.com/dpj4kdkxj/image/upload/v1712052201/Avatar/ho00vre4qctu4oj2dldv.png'
        case 'I':
            return 'https://res.cloudinary.com/dpj4kdkxj/image/upload/v1712052202/Avatar/iidwue0cvih6xyaayftp.png'
        case 'J':
            return 'https://res.cloudinary.com/dpj4kdkxj/image/upload/v1712052201/Avatar/uagvdqc7yadxhoudibc6.png'
        case 'K':
            return 'https://res.cloudinary.com/dpj4kdkxj/image/upload/v1712052201/Avatar/chyepyt6ybs5vwvdz4an.png'
        case 'L':
            return 'https://res.cloudinary.com/dpj4kdkxj/image/upload/v1712052202/Avatar/n0jctupyx3qkjiqohlzr.png'
        case 'M':
            return 'https://res.cloudinary.com/dpj4kdkxj/image/upload/v1712052202/Avatar/mrp2w1tersmekvjtjzuc.png'
        case 'N':
            return 'https://res.cloudinary.com/dpj4kdkxj/image/upload/v1712052201/Avatar/uqctxuuazj8maei2c2ro.png'
        case 'O':
            return 'https://res.cloudinary.com/dpj4kdkxj/image/upload/v1712052202/Avatar/ycfi5iry5kd1fcqqr7yh.png'
        case 'P':
            return 'https://res.cloudinary.com/dpj4kdkxj/image/upload/v1712052202/Avatar/p0ev1ei7yqx2xqcnibss.png'
        case 'Q':
            return 'https://res.cloudinary.com/dpj4kdkxj/image/upload/v1712052202/Avatar/mp9xnna860lwsg4s17jr.png'
        case 'R':
            return 'https://res.cloudinary.com/dpj4kdkxj/image/upload/v1712052202/Avatar/wq1olufzaaxkv5gsrgys.png'
        case 'S':
            return 'https://res.cloudinary.com/dpj4kdkxj/image/upload/v1712052203/Avatar/vwloqpffparddfio0tcz.png'
        case 'T':
            return 'https://res.cloudinary.com/dpj4kdkxj/image/upload/v1712052203/Avatar/a6uys1suarubng1ea4px.png'
        case 'U':
            return 'https://res.cloudinary.com/dpj4kdkxj/image/upload/v1712052203/Avatar/thpfcll2wczz4bt6roji.png'
        case 'V':
            return 'https://res.cloudinary.com/dpj4kdkxj/image/upload/v1712052203/Avatar/e3q3mumgwgozxdnsgy28.png'
        case 'W':
            return 'https://res.cloudinary.com/dpj4kdkxj/image/upload/v1712052203/Avatar/brlhzru8u4ddw9l0rvam.png'
        case 'X':
            return 'https://res.cloudinary.com/dpj4kdkxj/image/upload/v1712052205/Avatar/exm9yiore9goeom3ms7y.png'
        case 'Y':
            return 'https://res.cloudinary.com/dpj4kdkxj/image/upload/v1712052205/Avatar/ypnvcw3uibslsyjoowyi.png'
        case 'Z':
            return 'https://res.cloudinary.com/dpj4kdkxj/image/upload/v1712052205/Avatar/gqjr3ngkxijxqm6v1ahc.png'
        default:
            return 'https://res.cloudinary.com/dpj4kdkxj/image/upload/v1712052217/hhj4mhywmprfrsvlpuex.jpg'
    }
}

export default uploadDefaultAvatar
