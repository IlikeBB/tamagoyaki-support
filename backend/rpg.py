"""Profile progression derived from received feedback, including archived votes."""


def progression(likes, dislikes):
    xp=likes*20-dislikes*5
    level=max(1,xp//100+1)
    titles=((50,'傳說支援者'),(20,'遠征老手'),(10,'可靠嚮導'),(5,'情報新星'),(1,'見習遠征者'))
    return {'xp':xp,'level':level,'title':next(title for minimum,title in titles if level>=minimum),
            'progress':max(0,xp-(level-1)*100),'required':100,
            'next_level':level+1,'needed':level*100-xp}
