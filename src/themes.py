# Color themes. h1-h3 header gradient, ac/ac2 main accent, co second accent (cot = text on it),
# bg page, th table header tint, tin input-cell tint, tcy calculated-cell tint, pos/neg profit/loss.
T={
 'teal':  dict(name='Teal & Coral', h1='#0b6e66',h2='#0f9488',h3='#14a99a',ac='#0f9488',ac2='#0b6e66',co='#ff7a66',cot='#fff',bg='#f1f7f6',th='#e3f2f0',tin='rgba(255,122,102,.16)',tcy='rgba(15,148,136,.16)',pos='#0f9488',neg='#e8604c'),
 'navy':  dict(name='Navy & Gold',  h1='#0f1f3d',h2='#1b3461',h3='#25467f',ac='#1f4e99',ac2='#16335f',co='#f2b134',cot='#1b2333',bg='#f3f5f9',th='#e6ecf6',tin='rgba(242,177,52,.18)',tcy='rgba(31,78,153,.12)',pos='#1f8a5b',neg='#d64545'),
 'forest':dict(name='Forest & Sand',h1='#1e3d2f',h2='#2d5a43',h3='#3b7356',ac='#2d6a4f',ac2='#1e3d2f',co='#e9c46a',cot='#1e3d2f',bg='#f5f4ee',th='#e7efe9',tin='rgba(233,196,106,.22)',tcy='rgba(45,106,79,.12)',pos='#2d6a4f',neg='#c8553d'),
 'plum':  dict(name='Plum & Peach', h1='#3d1f4f',h2='#5b2d73',h3='#7a3f94',ac='#6a3a86',ac2='#4a2660',co='#ffad87',cot='#3d1f4f',bg='#f7f3f8',th='#efe6f3',tin='rgba(255,173,135,.2)',tcy='rgba(106,58,134,.11)',pos='#2a9d8f',neg='#e0605a'),
 'slate': dict(name='Slate & Orange',h1='#1f2933',h2='#323f4b',h3='#3e4c59',ac='#3e4c59',ac2='#1f2933',co='#ff8a3d',cot='#fff',bg='#f4f5f7',th='#e8ebef',tin='rgba(255,138,61,.15)',tcy='rgba(62,76,89,.10)',pos='#2f9e6e',neg='#e5533d'),
 'pink':  dict(name='Blush & Rose', h1='#c2416f',h2='#e0679a',h3='#f29ac0',ac='#d6457c',ac2='#a8305d',co='#ffd166',cot='#7a2246',bg='#fdf4f7',th='#fbe4ee',tin='rgba(242,154,192,.2)',tcy='rgba(214,69,124,.09)',pos='#2a9d8f',neg='#e5484d'),
}
def css(k):
    t=T[k];return ':root{'+''.join(f'--{a}:{b};' for a,b in t.items() if a!='name')+'}'
